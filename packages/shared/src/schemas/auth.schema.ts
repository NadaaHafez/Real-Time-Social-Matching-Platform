import { z } from "zod";

// ============================================================================
// REQUESTS
// ============================================================================

/**
 * The object `Pi.authenticate()` resolves with, forwarded as-is.
 *
 * `user` is checked for shape and then ignored. Anyone can POST any uid, so the backend
 * takes the identity from Pi's answer to `GET /v2/me`, never from this object.
 */
export const piAuthResultSchema = z
  .object({
    accessToken: z
      .string()
      .min(1, "accessToken is required")
      .describe("Pi's access token. The only part that proves anything; verified against GET /v2/me."),
    user: z
      .object({
        uid: z.string().min(1),
        username: z.string().min(1),
        roles: z.array(z.string()).optional().describe("Pi platform roles, not this app's role."),
      })
      .describe("Untrusted. Validated for shape, then ignored."),
  })
  .describe("The object Pi.authenticate() resolves with.");

export type PiAuthResult = z.infer<typeof piAuthResultSchema>;

export const signInRequestSchema = z.object({ authResult: piAuthResultSchema });
export type SignInRequest = z.infer<typeof signInRequestSchema>;

/** Refresh and sign-out both identify the session by its refresh token. */
export const refreshTokenRequestSchema = z.object({
  refreshToken: z.string().min(1, "refreshToken is required"),
});
export type RefreshTokenRequest = z.infer<typeof refreshTokenRequestSchema>;

// ============================================================================
// RESPONSES
// ============================================================================

export const piUserSchema = z.object({
  uid: z.string().describe("Pi account uid, the stable identity."),
  username: z.string().describe("Pi username, shown as @username."),
});
export type PiUser = z.infer<typeof piUserSchema>;

export const authTokensSchema = z
  .object({
    accessToken: z
      .string()
      .describe("JWT. Send as `Authorization: Bearer <token>` on every authenticated call."),
    accessTokenExpiresIn: z
      .number()
      .int()
      .describe("Seconds until the access token expires. Refresh shortly before."),
    refreshToken: z
      .string()
      .describe(
        "Single use. Trade it at POST /auth/refresh for a new pair; the old one stops working. " +
          "Presenting a used one revokes every session of the account.",
      ),
  })
  .describe("A fresh access + refresh token pair.");
export type AuthTokens = z.infer<typeof authTokensSchema>;

export const signInResponseSchema = z.object({
  user: piUserSchema,
  isNewUser: z
    .boolean()
    .describe(
      'True while onboarding is unfinished, not "the row was just created". Send the user to ' +
        "onboarding whenever this is true.",
    ),
  tokens: authTokensSchema,
});
export type SignInResponse = z.infer<typeof signInResponseSchema>;

// ============================================================================
// OPENAPI COMPONENTS
// ============================================================================

/** Name -> schema. The backend's docs builder turns each into `#/components/schemas/<Name>`. */
export const authSchemaComponents = {
  PiAuthResult: piAuthResultSchema,
  SignInRequest: signInRequestSchema,
  RefreshTokenRequest: refreshTokenRequestSchema,
  PiUser: piUserSchema,
  AuthTokens: authTokensSchema,
  SignInResponse: signInResponseSchema,
};
