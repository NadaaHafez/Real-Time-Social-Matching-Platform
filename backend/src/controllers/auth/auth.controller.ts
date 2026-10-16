import type { AuthTokens, RefreshTokenRequest, SignInRequest, SignInResponse } from "@chat-roulette/shared";

import * as authService from "../../services/auth/auth.service";
import { asyncHandler } from "../../utils/asyncHandler";

/**
 * HTTP in, HTTP out. Each handler reads the validated body, calls the service, and sends
 * what it returns. The generics make `res.json()` reject anything that isn't the shared
 * response type.
 */

export const signIn = asyncHandler<SignInResponse, SignInRequest>(async (req, res) => {
  res.status(200).json(await authService.signIn(req.body.authResult));
});

export const refresh = asyncHandler<AuthTokens, RefreshTokenRequest>(async (req, res) => {
  res.status(200).json(await authService.refresh(req.body.refreshToken));
});

export const signOut = asyncHandler<void, RefreshTokenRequest>(async (req, res) => {
  await authService.signOut(req.body.refreshToken);
  res.status(204).send();
});
