import { Router } from "express";
import { z } from "zod";

import { signInResponseSchema } from "@social-matching/shared";

import * as devController from "../../controllers/dev/dev.controller";
import { buildRouteSpec, registerLocalSchema } from "../../docs/defineRoute";
import { validateBody } from "../../middleware/validation";

/**
 * Developer tools. app.ts mounts this only outside production, which is why nothing here
 * needs auth.
 */

const router = Router();

// ============================================================================
// OPENAPI PATH SPECS
// ============================================================================

// Backend-only: no real client sends this.
const devSignInRequestSchema = registerLocalSchema(
  "DevSignInRequest",
  z.object({
    username: z
      .string()
      .regex(/^[A-Za-z0-9_]{3,30}$/, "3-30 letters, digits or underscores")
      .describe("Any name. The same name always signs in to the same account."),
  }),
);
export type DevSignInRequest = z.infer<typeof devSignInRequestSchema>;

const devSignInSpec = buildRouteSpec({
  summary: "Sign in without Pi (development only)",
  description:
    "Creates or reuses the account `dev-<username>` and returns the same response as " +
    "`POST /auth/signin`. Copy `tokens.accessToken` into **Authorize**. Not mounted in production.",
  tags: ["Dev"],
  public: true,
  body: devSignInRequestSchema,
  successResponse: { status: 200, description: "Signed in.", dataRef: signInResponseSchema },
  errors: ["validation", "internal"],
});

export const devRoutePaths = {
  "/dev/signin": { post: devSignInSpec },
};

// ============================================================================
// DEV ROUTES
// ============================================================================

router.post("/signin", validateBody(devSignInRequestSchema), devController.signIn);

export default router;
