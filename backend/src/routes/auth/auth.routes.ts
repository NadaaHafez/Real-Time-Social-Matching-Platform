import { Router } from "express";

import {
  refreshTokenRequestSchema,
  signInRequestSchema,
  signInResponseSchema,
  authTokensSchema,
} from "@chat-roulette/shared";

import * as authController from "../../controllers/auth/auth.controller";
import { buildRouteSpec, errorResponse } from "../../docs/defineRoute";
import { authLimiter } from "../../middleware/rateLimit";
import { validateBody } from "../../middleware/validation";

const router = Router();

// ============================================================================
// OPENAPI PATH SPECS
// ============================================================================

const TAGS = ["Auth"];

const signInSpec = buildRouteSpec({
  summary: "Sign in with a Pi auth result",
  description:
    "Takes the whole `AuthResult` from `Pi.authenticate()`.\n\n" +
    "`authResult.user` is **never trusted**: anyone can POST any uid. The backend verifies " +
    "`accessToken` against `GET /v2/me` on the Pi Platform API and uses the identity Pi " +
    "vouches for. The account is created on first sign-in.",
  tags: TAGS,
  public: true,
  body: signInRequestSchema,
  successResponse: {
    status: 200,
    description: "Signed in. Use `tokens.accessToken` as the bearer token.",
    dataRef: signInResponseSchema,
  },
  errors: ["validation", "rateLimited", "internal"],
  extraResponses: {
    401: errorResponse("Pi could not verify the access token — `invalid_pi_token`."),
    403: errorResponse("The account is suspended or banned — `account_suspended` / `account_banned`."),
    503: errorResponse("The Pi Platform API timed out or is down — `pi_unavailable`. Safe to retry."),
  },
});

const refreshSpec = buildRouteSpec({
  summary: "Trade a refresh token for a new token pair",
  description:
    "Refresh tokens are single use: the one sent stops working and a new pair comes back. " +
    "Presenting one that was already used is treated as theft, and signs the account out " +
    "everywhere.",
  tags: TAGS,
  public: true,
  body: refreshTokenRequestSchema,
  successResponse: { status: 200, description: "A fresh token pair.", dataRef: authTokensSchema },
  errors: ["validation", "rateLimited", "internal"],
  extraResponses: {
    401: errorResponse("Unknown, expired or already-used refresh token — `invalid_refresh_token`."),
    403: errorResponse("The account is suspended or banned — `account_suspended` / `account_banned`."),
  },
});

const signOutSpec = buildRouteSpec({
  summary: "Sign out this device",
  description:
    "Revokes the refresh token. Needs no access token, so a client whose access token has " +
    "already expired can still sign out. Succeeds even if the token was already revoked.\n\n" +
    "The access token stays valid until it expires (minutes); the client should drop it.",
  tags: TAGS,
  public: true,
  body: refreshTokenRequestSchema,
  successResponse: { status: 204, description: "Signed out." },
  errors: ["validation", "rateLimited", "internal"],
});

export const authRoutePaths = {
  "/auth/signin": { post: signInSpec },
  "/auth/refresh": { post: refreshSpec },
  "/auth/signout": { post: signOutSpec },
};

// ============================================================================
// AUTH ROUTES
// ============================================================================

// The limiter runs before validation: no point parsing a body about to be rejected, and
// each sign-in that gets through costs one Pi Platform call against our API key.
router.post("/signin", authLimiter, validateBody(signInRequestSchema), authController.signIn);
router.post("/refresh", authLimiter, validateBody(refreshTokenRequestSchema), authController.refresh);
router.post("/signout", validateBody(refreshTokenRequestSchema), authController.signOut);

export default router;
