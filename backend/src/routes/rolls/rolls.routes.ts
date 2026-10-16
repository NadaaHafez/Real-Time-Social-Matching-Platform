import { Router } from "express";

import {
  claimStreakResponseSchema,
  dailyStreakSchema,
  ledgerPageSchema,
  ledgerQuerySchema,
  rollsBalanceSchema,
} from "@social-matching/shared";

import * as rollsController from "../../controllers/rolls/rolls.controller";
import { buildRouteSpec, errorResponse } from "../../docs/defineRoute";
import { requireUser } from "../../middleware/auth";
import { validateQuery } from "../../middleware/validation";

const router = Router();

// ============================================================================
// OPENAPI PATH SPECS
// ============================================================================

const TAGS = ["Rolls"];

const getBalanceSpec = buildRouteSpec({
  summary: "Get the Rolls balance",
  tags: TAGS,
  successResponse: { status: 200, description: "The balance.", dataRef: rollsBalanceSchema },
});

const getLedgerSpec = buildRouteSpec({
  summary: "Get the wallet history",
  description: "Newest first. Pass `nextCursor` back as `cursor` for the next page.",
  tags: TAGS,
  query: ledgerQuerySchema,
  successResponse: { status: 200, description: "One page of entries.", dataRef: ledgerPageSchema },
  errors: ["validation", "unauthorized", "forbidden", "rateLimited", "internal"],
});

const claimWelcomeSpec = buildRouteSpec({
  summary: "Claim the one-time welcome Rolls",
  description: "Only after onboarding. Safe to repeat: later calls return the balance unchanged.",
  tags: TAGS,
  successResponse: { status: 200, description: "The balance after the grant.", dataRef: rollsBalanceSchema },
  extraResponses: {
    404: errorResponse("The account no longer exists — `user_not_found`."),
    409: errorResponse("Onboarding is not finished — `onboarding_incomplete`."),
  },
});

const getStreakSpec = buildRouteSpec({
  summary: "Get the daily streak",
  tags: TAGS,
  successResponse: { status: 200, description: "The current streak.", dataRef: dailyStreakSchema },
});

const claimStreakSpec = buildRouteSpec({
  summary: "Claim today's streak Rolls",
  description: "Once per UTC day.",
  tags: TAGS,
  successResponse: { status: 200, description: "The streak and new balance.", dataRef: claimStreakResponseSchema },
  extraResponses: {
    409: errorResponse("Already claimed today — `already_claimed_today`."),
  },
});

export const rollsRoutePaths = {
  "/rolls/balance": { get: getBalanceSpec },
  "/rolls/ledger": { get: getLedgerSpec },
  "/rolls/welcome": { post: claimWelcomeSpec },
  "/rolls/streak": { get: getStreakSpec },
  "/rolls/streak/claim": { post: claimStreakSpec },
};

// ============================================================================
// ROLLS ROUTES
// ============================================================================

router.use(requireUser);

router.get("/balance", rollsController.getBalance);
router.get("/ledger", validateQuery(ledgerQuerySchema), rollsController.getLedger);
router.post("/welcome", rollsController.claimWelcomeRolls);
router.get("/streak", rollsController.getStreak);
router.post("/streak/claim", rollsController.claimStreak);

export default router;
