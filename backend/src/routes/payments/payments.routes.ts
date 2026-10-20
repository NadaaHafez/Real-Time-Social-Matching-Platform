import { Router } from "express";

import { paymentIdRequestSchema, paymentReceiptSchema, rollPackSchema } from "@social-matching/shared";

import * as paymentsController from "../../controllers/payments/payments.controller";
import { arrayOf, buildRouteSpec, errorResponse } from "../../docs/defineRoute";
import { requireUser } from "../../middleware/auth";
import { validateBody } from "../../middleware/validation";

const router = Router();

// ============================================================================
// OPENAPI PATH SPECS
// ============================================================================

const TAGS = ["Payments"];
const AUTHED_WITH_BODY = ["validation", "unauthorized", "forbidden", "rateLimited", "internal"] as const;

const PI_DOWN = errorResponse("Pi did not answer — `pi_unavailable`. Safe to retry.");

const listPacksSpec = buildRouteSpec({
  summary: "List the Roll packs on sale",
  tags: TAGS,
  successResponse: { status: 200, description: "Active packs, in display order.", dataSchema: arrayOf(rollPackSchema) },
});

const approveSpec = buildRouteSpec({
  summary: "Approve a payment (Pi SDK onReadyForServerApproval)",
  description:
    "Fetches the payment from Pi, checks it belongs to the caller and that `amount` equals the " +
    "price of `metadata.packId`, records it, then approves it with Pi.",
  tags: TAGS,
  body: paymentIdRequestSchema,
  successResponse: { status: 204, description: "Approved. The wallet dialog can continue." },
  errors: [...AUTHED_WITH_BODY],
  extraResponses: {
    400: errorResponse("`unknown_pack`, `amount_mismatch`, or a bad body (`validation_failed`)."),
    403: errorResponse("The payment belongs to another account — `payment_user_mismatch`."),
    404: errorResponse("Pi has no such payment — `payment_not_found`."),
    409: errorResponse("Already cancelled — `payment_cancelled`."),
    503: PI_DOWN,
  },
});

const completeSpec = buildRouteSpec({
  summary: "Settle a payment (onReadyForServerCompletion and onIncompletePaymentFound)",
  description:
    "Credits the Rolls once Pi confirms, using the txid Pi reports. A payment that was never " +
    "signed is cancelled instead. Safe to repeat: a settled payment returns the same receipt.",
  tags: TAGS,
  body: paymentIdRequestSchema,
  successResponse: { status: 200, description: "How the payment ended.", dataRef: paymentReceiptSchema },
  errors: [...AUTHED_WITH_BODY],
  extraResponses: {
    403: errorResponse("The payment belongs to another account — `payment_user_mismatch`."),
    404: errorResponse("Never approved here (`purchase_not_found`), or unknown to Pi (`payment_not_found`)."),
    503: PI_DOWN,
  },
});

const cancelSpec = buildRouteSpec({
  summary: "Record a cancelled payment (Pi SDK onCancel)",
  description: "Marks a pending purchase cancelled. Unknown or settled ids are ignored.",
  tags: TAGS,
  body: paymentIdRequestSchema,
  successResponse: { status: 204, description: "Recorded, or nothing to do." },
  errors: [...AUTHED_WITH_BODY],
});

export const paymentsRoutePaths = {
  "/payments/packs": { get: listPacksSpec },
  "/payments/approve": { post: approveSpec },
  "/payments/complete": { post: completeSpec },
  "/payments/cancel": { post: cancelSpec },
};

// ============================================================================
// PAYMENTS ROUTES
// ============================================================================

router.use(requireUser);

router.get("/packs", paymentsController.listPacks);
router.post("/approve", validateBody(paymentIdRequestSchema), paymentsController.approve);
router.post("/complete", validateBody(paymentIdRequestSchema), paymentsController.complete);
router.post("/cancel", validateBody(paymentIdRequestSchema), paymentsController.cancel);

export default router;
