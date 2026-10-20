import { z } from "zod";

import { purchaseStatusSchema } from "../generated/prisma";
import { rollsBalanceSchema } from "./rolls.schema";

// ============================================================================
// REQUESTS
// ============================================================================

/** Approve, complete and cancel all identify the payment the same way. */
export const paymentIdRequestSchema = z.object({
  paymentId: z.string().min(1, "paymentId is required").describe("The identifier the Pi SDK produced."),
});
export type PaymentIdRequest = z.infer<typeof paymentIdRequestSchema>;

// ============================================================================
// RESPONSES
// ============================================================================

export const rollPackSchema = z.object({
  id: z.string().describe("Send as `metadata.packId` in `Pi.createPayment()`."),
  rolls: z.number().int(),
  priceInPi: z.number().describe("The exact `amount` to pass to `Pi.createPayment()`. Anything else is refused."),
  tag: z.string().nullable().describe("Label to show, like `popular`."),
});
export type RollPack = z.infer<typeof rollPackSchema>;

export const paymentReceiptSchema = z
  .object({
    paymentId: z.string(),
    status: purchaseStatusSchema.exclude(["pending"]),
    rollsCredited: z.number().int().describe("0 unless `status` is `completed`."),
    piPaid: z.number(),
    txid: z.string().nullable().describe("On-chain transaction id. Null when cancelled."),
    balance: rollsBalanceSchema.describe("After this payment, so the client needs no re-fetch."),
  })
  .describe("How a payment ended.");
export type PaymentReceipt = z.infer<typeof paymentReceiptSchema>;

// ============================================================================
// OPENAPI COMPONENTS
// ============================================================================

export const paymentsSchemaComponents = {
  PaymentIdRequest: paymentIdRequestSchema,
  RollPack: rollPackSchema,
  PaymentReceipt: paymentReceiptSchema,
};
