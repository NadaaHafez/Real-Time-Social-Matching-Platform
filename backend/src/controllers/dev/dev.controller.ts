import type { SignInResponse } from "@social-matching/shared";

import type { DevSignInRequest } from "../../routes/dev/dev.routes";
import * as devService from "../../services/dev/dev.service";
import { asyncHandler } from "../../utils/asyncHandler";

export const signIn = asyncHandler<SignInResponse, DevSignInRequest>(async (req, res) => {
  res.status(200).json(await devService.devSignIn(req.body.username));
});
