import type { PaymentIdRequest, PaymentReceipt, RollPack } from "@social-matching/shared";

import * as paymentsService from "../../services/payments/payments.service";
import { asyncHandler } from "../../utils/asyncHandler";

// requireUser runs before every route here, so `currentUser!` is safe.

export const listPacks = asyncHandler<RollPack[]>(async (_req, res) => {
  res.status(200).json(await paymentsService.listPacks());
});

export const approve = asyncHandler<void, PaymentIdRequest>(async (req, res) => {
  await paymentsService.approve(req.currentUser!, req.body.paymentId);
  res.status(204).send();
});

export const complete = asyncHandler<PaymentReceipt, PaymentIdRequest>(async (req, res) => {
  res.status(200).json(await paymentsService.complete(req.currentUser!, req.body.paymentId));
});

export const cancel = asyncHandler<void, PaymentIdRequest>(async (req, res) => {
  await paymentsService.cancel(req.currentUser!, req.body.paymentId);
  res.status(204).send();
});
