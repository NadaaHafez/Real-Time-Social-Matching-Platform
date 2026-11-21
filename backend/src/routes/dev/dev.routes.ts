import { Router } from "express";
import { z } from "zod";

import { rollsBalanceSchema, signInResponseSchema } from "@social-matching/shared";

import * as devController from "../../controllers/dev/dev.controller";
import { buildRouteSpec, registerLocalSchema } from "../../docs/defineRoute";
import { requireUser } from "../../middleware/auth";
import { validateBody } from "../../middleware/validation";

/**
 * Developer tools. app.ts mounts this only in development, on a demo, or during a load test
 * (see env.devToolsEnabled), which is why sign-in and cleanup need no auth.
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

const grantRollsRequestSchema = registerLocalSchema(
  "GrantRollsRequest",
  z.object({ amount: z.number().int().min(1).max(100_000) }),
);
export type GrantRollsRequest = z.infer<typeof grantRollsRequestSchema>;

const grantRollsSpec = buildRouteSpec({
  summary: "Give yourself Rolls (development and load tests)",
  description: "A `bonus` ledger entry, like any other grant, so the ledger stays balanced.",
  tags: ["Dev"],
  body: grantRollsRequestSchema,
  successResponse: { status: 200, description: "The new balance.", dataRef: rollsBalanceSchema },
  errors: ["validation", "unauthorized", "internal"],
});

const deleteBotsSpec = buildRouteSpec({
  summary: "Delete every load-test bot",
  description: "Hard-deletes the `bot_…` accounts and everything they made. Run it after a load test, not during one.",
  tags: ["Dev"],
  public: true,
  successResponse: { status: 200, description: "How many were deleted." },
  errors: ["internal"],
});

export const devRoutePaths = {
  "/dev/signin": { post: devSignInSpec },
  "/dev/rolls": { post: grantRollsSpec },
  "/dev/bots": { delete: deleteBotsSpec },
};

// ============================================================================
// DEV ROUTES
// ============================================================================

router.post("/signin", validateBody(devSignInRequestSchema), devController.signIn);
router.post("/rolls", requireUser, validateBody(grantRollsRequestSchema), devController.grantRolls);
router.delete("/bots", devController.deleteBots);

export default router;
