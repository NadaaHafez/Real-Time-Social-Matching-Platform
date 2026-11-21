import type { RollsBalance, SignInResponse } from "@social-matching/shared";

import type { DevSignInRequest, GrantRollsRequest } from "../../routes/dev/dev.routes";
import * as devService from "../../services/dev/dev.service";
import { asyncHandler } from "../../utils/asyncHandler";

export const signIn = asyncHandler<SignInResponse, DevSignInRequest>(async (req, res) => {
  res.status(200).json(await devService.devSignIn(req.body.username));
});

// requireUser runs before this route, so `currentUser!` is safe.
export const grantRolls = asyncHandler<RollsBalance, GrantRollsRequest>(async (req, res) => {
  res.status(200).json(await devService.grantRolls(req.currentUser!.id, req.body.amount));
});

export const deleteBots = asyncHandler<{ deleted: number }>(async (_req, res) => {
  res.status(200).json({ deleted: await devService.deleteBots() });
});
