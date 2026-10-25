import type { Profile, UpdateProfileRequest } from "@social-matching/shared";

import * as profileService from "../../services/profile/profile.service";
import { asyncHandler } from "../../utils/asyncHandler";

/**
 * requireUser runs before every route here and rejects the request without a user, so
 * `currentUser!` is safe.
 */

export const getProfile = asyncHandler<Profile>(async (req, res) => {
  res.status(200).json(await profileService.getProfile(req.currentUser!.id));
});

export const updateProfile = asyncHandler<Profile, UpdateProfileRequest>(async (req, res) => {
  res.status(200).json(await profileService.updateProfile(req.currentUser!.id, req.body));
});

export const acknowledgeWarning = asyncHandler<Profile>(async (req, res) => {
  res.status(200).json(await profileService.acknowledgeWarning(req.currentUser!.id));
});
