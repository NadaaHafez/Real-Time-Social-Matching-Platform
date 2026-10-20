import { Router } from "express";

import {
  buySlotRequestSchema,
  buySlotResponseSchema,
  filterStateSchema,
  updateFiltersRequestSchema,
} from "@social-matching/shared";

import * as filtersController from "../../controllers/filters/filters.controller";
import { buildRouteSpec, errorResponse } from "../../docs/defineRoute";
import { requireUser } from "../../middleware/auth";
import { validateBody } from "../../middleware/validation";

const router = Router();

// ============================================================================
// OPENAPI PATH SPECS
// ============================================================================

const TAGS = ["Filters"];

const getFiltersSpec = buildRouteSpec({
  summary: "Get the Filters page",
  description: "Saved filters, country slots, and what the next roll costs. Every filter starts off.",
  tags: TAGS,
  successResponse: { status: 200, description: "The filters page.", dataRef: filterStateSchema },
});

const updateFiltersSpec = buildRouteSpec({
  summary: "Replace the match filters",
  description:
    "A full replacement. Each country list may hold free + bought slots; a list already over " +
    "that may be kept or changed, just not made longer. Applies from the next roll.",
  tags: TAGS,
  body: updateFiltersRequestSchema,
  successResponse: { status: 200, description: "The saved filters page.", dataRef: filterStateSchema },
  extraResponses: {
    400: errorResponse(
      "A bad body (`validation_failed`), an age below the minimum (`below_minimum_age`), or a " +
        "list longer than its slots (`not_enough_slots`).",
    ),
  },
});

const buySlotSpec = buildRouteSpec({
  summary: "Buy a country slot with Rolls",
  description: "Send `bought + 1` and the price shown. Repeating a bought slot charges nothing.",
  tags: TAGS,
  body: buySlotRequestSchema,
  successResponse: { status: 200, description: "The filters page and balance.", dataRef: buySlotResponseSchema },
  extraResponses: {
    400: errorResponse("Not enough Rolls (`insufficient_rolls`), or a bad body (`validation_failed`)."),
    409: errorResponse(
      "Refresh and show the new numbers: `slot_limit_reached`, `slot_changed` or `price_changed`.",
    ),
  },
});

export const filtersRoutePaths = {
  "/me/filters": { get: getFiltersSpec, put: updateFiltersSpec },
  "/me/filters/slots": { post: buySlotSpec },
};

// ============================================================================
// FILTERS ROUTES
// ============================================================================

router.use(requireUser);

router.get("/", filtersController.getFilters);
router.put("/", validateBody(updateFiltersRequestSchema), filtersController.updateFilters);
router.post("/slots", validateBody(buySlotRequestSchema), filtersController.buySlot);

export default router;
