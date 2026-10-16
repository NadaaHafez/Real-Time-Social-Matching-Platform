import type { AuthTokens, PiAuthResult, SignInResponse, UserStatus } from "@social-matching/shared";

import prisma from "../../config/database";
import logger from "../../config/logger";
import { HttpError } from "../../utils/httpError";
import * as piPlatform from "../pi/pi-platform.service";
import { blockedMessage, isServable } from "./suspension.service";
import { hashToken, issueTokens, revokeAllTokens } from "./token.service";

const INVALID_REFRESH = () =>
  HttpError.unauthorized("invalid_refresh_token", "Your session has ended. Sign in again.");

const ACCOUNT_FIELDS = {
  id: true,
  piUserId: true,
  username: true,
  status: true,
  suspendedUntil: true,
  onboardedAt: true,
  createdAt: true,
  deletedAt: true,
} as const;

/** Refuses closed, suspended and banned accounts. Shared by sign-in and refresh. */
async function assertCanSignIn(user: {
  id: string;
  username: string;
  status: UserStatus;
  suspendedUntil: Date | null;
  deletedAt: Date | null;
}) {
  // Upserts and relation loads bypass the soft-delete filter, so this is checked by hand.
  if (user.deletedAt) {
    throw HttpError.forbidden("account_deleted", "This account has been closed.");
  }

  if (!(await isServable(user))) {
    logger.warn("Blocked account attempted sign-in", {
      userId: user.id,
      username: user.username,
      status: user.status,
      category: "security",
    });

    throw HttpError.forbidden(`account_${user.status}`, blockedMessage(user));
  }
}

/**
 * Exchanges a Pi SDK auth result for a token pair.
 *
 * `authResult.user` is untrusted JSON. Only the access token proves anything, and only
 * Pi's server can check it, so everything below uses the identity Pi returns.
 */
export async function signIn(authResult: PiAuthResult): Promise<SignInResponse> {
  return signInAs(await piPlatform.verifyUser(authResult.accessToken));
}

/** Everything after identity is known. Only call with an identity Pi (or dev mode) vouches for. */
export async function signInAs(identity: { uid: string; username: string }): Promise<SignInResponse> {
  // Taken before the upsert, so "was this row just created" is exact rather than a guess.
  const startedAt = new Date();

  const user = await prisma.user.upsert({
    where: { piUserId: identity.uid },
    update: { username: identity.username },
    create: { piUserId: identity.uid, username: identity.username },
    select: ACCOUNT_FIELDS,
  });

  await assertCanSignIn(user);

  if (user.createdAt >= startedAt) {
    logger.info("Account created", { userId: user.id, username: user.username });
  }

  const { tokens } = await issueTokens(prisma, user);

  logger.info("Signed in", { userId: user.id, username: user.username, isNewUser: user.onboardedAt === null });

  return {
    user: { uid: user.piUserId, username: user.username },
    // "Has not finished onboarding", not "row just created": someone who abandoned the
    // onboarding screen and signs in again must be sent back to it.
    isNewUser: user.onboardedAt === null,
    tokens,
  };
}

/**
 * Rotates a refresh token: the presented one is revoked and a new pair issued.
 *
 * A token that was already revoked means two parties hold it — the user and whoever stole
 * it — and there is no telling which one is asking. So every session of that account is
 * ended and both have to sign in again with Pi, which only the real user can do.
 */
export async function refresh(presented: string): Promise<AuthTokens> {
  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(presented) },
    select: { id: true, userId: true, expiresAt: true, revokedAt: true, user: { select: ACCOUNT_FIELDS } },
  });

  if (!stored) throw INVALID_REFRESH();

  if (stored.revokedAt) {
    await reportReuse(stored.userId);
    throw INVALID_REFRESH();
  }

  if (stored.expiresAt <= new Date()) throw INVALID_REFRESH();

  await assertCanSignIn(stored.user);

  const tokens = await prisma.$transaction(async (tx) => {
    // Conditional, so two requests racing with the same token cannot both win: only one
    // update finds `revokedAt: null`, and the loser is treated as reuse.
    const claimed = await tx.refreshToken.updateMany({
      where: { id: stored.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    if (claimed.count === 0) return null;

    const issued = await issueTokens(tx, stored.user);

    await tx.refreshToken.update({
      where: { id: stored.id },
      data: { replacedById: issued.refreshTokenId },
    });

    return issued.tokens;
  });

  if (!tokens) {
    await reportReuse(stored.userId);
    throw INVALID_REFRESH();
  }

  return tokens;
}

async function reportReuse(userId: string) {
  const revoked = await revokeAllTokens(prisma, userId);

  logger.warn("Refresh token reused; all sessions revoked", { userId, revoked, category: "security" });
}

/** Idempotent: an unknown or already-revoked token still signs out successfully. */
export async function signOut(presented: string): Promise<void> {
  const { count } = await prisma.refreshToken.updateMany({
    where: { tokenHash: hashToken(presented), revokedAt: null },
    data: { revokedAt: new Date() },
  });

  if (count > 0) logger.info("Signed out");
}
