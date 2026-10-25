import { z } from "zod";

import { genderSchema } from "../generated/prisma";
import { countryCodeSchema } from "./common.schema";

// ============================================================================
// REQUESTS
// ============================================================================

/**
 * Zod checks shape; the service checks policy. The minimum age lives in Settings and an
 * admin can change it, so the bounds here are only sanity limits.
 *
 * Age, gender and country can be changed but not cleared, so a finished onboarding cannot
 * be undone. Only `iceBreaker` takes `null`.
 */
export const updateProfileRequestSchema = z
  .object({
    age: z
      .number()
      .int()
      .min(13)
      .max(120)
      .optional()
      .describe("Sanity bounds only. Below Settings.minimumAge returns 400 `below_minimum_age`."),
    gender: genderSchema.optional(),
    country: countryCodeSchema.optional(),
    iceBreaker: z
      .string()
      .trim()
      .min(1, "Send null to clear the ice breaker")
      .max(200)
      .nullable()
      .optional()
      .describe("Send `null` to clear it. Capped so it stays an opening line, not a wall of text."),
  })
  .refine((patch) => Object.keys(patch).length > 0, { message: "Provide at least one field to update" })
  .describe("A partial update: send only the fields that changed, but at least one.");
export type UpdateProfileRequest = z.infer<typeof updateProfileRequestSchema>;

// ============================================================================
// RESPONSES
// ============================================================================

export const pendingWarningSchema = z
  .object({
    issuedAt: z.string().datetime(),
    message: z.string().describe("Fixed wording. A moderator decides whether to warn, not what it says."),
  })
  .describe("Show once, then dismiss with POST /me/warning/ack. A warning restricts nothing.");
export type PendingWarning = z.infer<typeof pendingWarningSchema>;

/**
 * No `status`: requireUser refuses suspended and banned accounts before this is ever built,
 * so it would always say `active`.
 */
export const profileSchema = z
  .object({
    uid: z.string().describe("Pi account uid."),
    username: z.string().describe("Pi username, shown as @username."),
    age: z.number().int().nullable().describe("Null until onboarding."),
    gender: genderSchema.nullable().describe("Null until onboarding."),
    country: countryCodeSchema.nullable().describe("Null until onboarding."),
    iceBreaker: z
      .string()
      .nullable()
      .describe("Pre-filled into the composer when a chat starts. Nothing is sent automatically."),
    isNewUser: z
      .boolean()
      .describe(
        "Same meaning as on sign-in: onboarding is unfinished. Flips to false in the PATCH " +
          "response that sets the last of age, gender and country.",
      ),
    needsTermsAcceptance: z
      .boolean()
      .describe("True when the current terms must be accepted before rolling. Show the terms screen."),
    pendingWarning: pendingWarningSchema.nullable().describe("Null for almost everyone."),
    createdAt: z.string().datetime(),
  })
  .describe("The signed-in user's own profile.");
export type Profile = z.infer<typeof profileSchema>;

// ============================================================================
// OPENAPI COMPONENTS
// ============================================================================

export const profileSchemaComponents = {
  UpdateProfileRequest: updateProfileRequestSchema,
  PendingWarning: pendingWarningSchema,
  Profile: profileSchema,
};
