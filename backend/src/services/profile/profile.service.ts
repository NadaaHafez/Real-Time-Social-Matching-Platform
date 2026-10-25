import type { CountryCode, Profile, UpdateProfileRequest, UserModel } from "@social-matching/shared";

import prisma from "../../config/database";
import logger from "../../config/logger";
import { HttpError } from "../../utils/httpError";
import * as legalService from "../legal/legal.service";
import { getSettings } from "../settings/settings.service";

/** `satisfies` ties every key to a real User column, so a typo stops compiling. */
const PROFILE_FIELDS = {
  piUserId: true,
  username: true,
  age: true,
  gender: true,
  country: true,
  iceBreaker: true,
  onboardedAt: true,
  warnedAt: true,
  createdAt: true,
} as const satisfies Partial<Record<keyof UserModel, true>>;

type ProfileRecord = Pick<UserModel, keyof typeof PROFILE_FIELDS>;

const USER_GONE = () => HttpError.notFound("user_not_found", "This account no longer exists.");

/** One fixed wording: a moderator decides whether to warn, not what it says. */
const WARNING_MESSAGE =
  "A moderator reviewed a report about one of your chats. Please keep conversations respectful. " +
  "Further reports may lead to a suspension.";

/** The database row → the API shape. The terms check is cached, so this rarely queries. */
async function toProfile(userId: string, user: ProfileRecord): Promise<Profile> {
  return {
    uid: user.piUserId,
    username: user.username,
    age: user.age,
    gender: user.gender,
    // The column is plain char(2), but the only writer is updateProfile, after validation.
    country: user.country as CountryCode | null,
    iceBreaker: user.iceBreaker,
    isNewUser: user.onboardedAt === null,
    needsTermsAcceptance: await legalService.needsTermsAcceptance(userId),
    pendingWarning: user.warnedAt ? { issuedAt: user.warnedAt.toISOString(), message: WARNING_MESSAGE } : null,
    createdAt: user.createdAt.toISOString(),
  };
}

/** Marks the warning seen. Safe to repeat: dismissing nothing succeeds. */
export async function acknowledgeWarning(userId: string): Promise<Profile> {
  const user = await prisma.user.update({ where: { id: userId }, data: { warnedAt: null }, select: PROFILE_FIELDS });
  return toProfile(userId, user);
}

/** Accepts the current terms and hands back the profile, with `needsTermsAcceptance` now false. */
export async function acceptTerms(userId: string, documentId: string): Promise<Profile> {
  await legalService.acceptTerms(userId, documentId);
  return getProfile(userId);
}

export async function getProfile(userId: string): Promise<Profile> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: PROFILE_FIELDS });

  // requireUser just found this user, so only an account closed in between lands here.
  if (!user) throw USER_GONE();

  return toProfile(userId, user);
}

/**
 * Onboarding writes age, gender and country here, and the profile screen edits them later.
 *
 * Zod has already checked the shape. The minimum age is policy, not shape: it lives in
 * Settings and an admin can change it, so it is checked here, where the database is.
 */
export async function updateProfile(userId: string, patch: UpdateProfileRequest): Promise<Profile> {
  if (patch.age !== undefined) {
    const { minimumAge } = await getSettings();

    if (patch.age < minimumAge) {
      throw HttpError.badRequest("below_minimum_age", `You must be at least ${minimumAge} to use this app.`);
    }
  }

  const before = await prisma.user.findUnique({
    where: { id: userId },
    select: { age: true, gender: true, country: true, onboardedAt: true },
  });

  if (!before) throw USER_GONE();

  // Onboarding is finished the first time all three matching fields are set. Stamped here,
  // not on a later screen, so a user who skips that screen is not sent back to onboarding
  // on every sign-in.
  const completesOnboarding =
    before.onboardedAt === null &&
    (patch.age ?? before.age) !== null &&
    (patch.gender ?? before.gender) !== null &&
    (patch.country ?? before.country) !== null;

  const user = await prisma.user.update({
    where: { id: userId },
    // One write, so the profile and the completion stamp can never disagree.
    data: { ...patch, ...(completesOnboarding ? { onboardedAt: new Date() } : {}) },
    select: PROFILE_FIELDS,
  });

  if (completesOnboarding) {
    logger.info("Onboarding finished", { userId, username: user.username });
  }

  return toProfile(userId, user);
}
