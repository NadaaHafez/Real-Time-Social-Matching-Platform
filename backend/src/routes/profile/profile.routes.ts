import { Router } from "express";

import { profileSchema, updateProfileRequestSchema } from "@social-matching/shared";

import * as profileController from "../../controllers/profile/profile.controller";
import { buildRouteSpec, errorResponse } from "../../docs/defineRoute";
import { requireUser } from "../../middleware/auth";
import { validateBody } from "../../middleware/validation";

const router = Router();

// ============================================================================
// OPENAPI PATH SPECS
// ============================================================================

const TAGS = ["Profile"];

const USER_GONE = errorResponse("The account was closed mid-request — `user_not_found`.");

const getProfileSpec = buildRouteSpec({
  summary: "Get the signed-in user's profile",
  tags: TAGS,
  successResponse: { status: 200, description: "The profile.", dataRef: profileSchema },
  extraResponses: { 404: USER_GONE },
});

const updateProfileSpec = buildRouteSpec({
  summary: "Update age, gender, country or ice breaker",
  description:
    "A partial update: send only the fields that changed, but at least one.\n\n" +
    "Onboarding is finished the first time `age`, `gender` and `country` are all set. That " +
    "response, and every sign-in after it, has `isNewUser: false`.",
  tags: TAGS,
  body: updateProfileRequestSchema,
  successResponse: { status: 200, description: "The updated profile.", dataRef: profileSchema },
  extraResponses: {
    400: errorResponse(
      "A bad body or an empty one (`validation_failed`), or an age below the minimum in " +
        "Settings (`below_minimum_age`).",
    ),
    404: USER_GONE,
  },
});

const acknowledgeWarningSpec = buildRouteSpec({
  summary: "Dismiss the pending warning",
  description: "Clears `pendingWarning`. Safe to repeat: dismissing nothing succeeds.",
  tags: TAGS,
  successResponse: { status: 200, description: "The profile, with `pendingWarning: null`.", dataRef: profileSchema },
});

export const profileRoutePaths = {
  "/me/profile": { get: getProfileSpec, patch: updateProfileSpec },
  "/me/warning/ack": { post: acknowledgeWarningSpec },
};

// ============================================================================
// PROFILE ROUTES
// ============================================================================

// Everything under /me acts on behalf of the signed-in user.
router.use(requireUser);

router.get("/profile", profileController.getProfile);
router.patch("/profile", validateBody(updateProfileRequestSchema), profileController.updateProfile);
router.post("/warning/ack", profileController.acknowledgeWarning);

export default router;
