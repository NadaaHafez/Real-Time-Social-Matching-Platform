import type { PaymentReceipt, RollPack, RollsBalance } from "@social-matching/shared";

import { Prisma } from "../../../generated/prisma/client";
import prisma from "../../config/database";
import logger from "../../config/logger";
import type { CurrentUser } from "../../types/express";
import { HttpError } from "../../utils/httpError";
import * as piPlatform from "../pi/pi-platform.service";
import * as ledger from "../rolls/ledger.service";

/**
 * Pi's U2A flow: approve (we check it, then Pi approves) → the user signs in their wallet →
 * complete (Pi confirms, then we credit). Client callbacks prove nothing, so every decision
 * uses the payment as Pi reports it.
 */

const notYours = () => HttpError.forbidden("payment_user_mismatch", "This payment belongs to a different account.");

function toReceipt(
  purchase: { piPaymentId: string; status: string; rolls: number; piAmount: Prisma.Decimal; txid: string | null },
  balance: RollsBalance,
): PaymentReceipt {
  const completed = purchase.status === "completed";

  return {
    paymentId: purchase.piPaymentId,
    status: completed ? "completed" : "cancelled",
    rollsCredited: completed ? purchase.rolls : 0,
    piPaid: purchase.piAmount.toNumber(),
    txid: purchase.txid,
    balance,
  };
}

export async function listPacks(): Promise<RollPack[]> {
  const packs = await prisma.rollPack.findMany({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
    select: { id: true, rolls: true, priceInPi: true, tag: true },
  });

  return packs.map((pack) => ({ ...pack, priceInPi: pack.priceInPi.toNumber() }));
}

export async function approve(user: CurrentUser, paymentId: string): Promise<void> {
  const payment = await piPlatform.getPayment(paymentId);

  // Otherwise anyone could approve someone else's payment and have the Rolls land with them.
  if (payment.user_uid !== user.piUserId) throw notYours();

  if (payment.status.cancelled || payment.status.user_cancelled) {
    throw HttpError.conflict("payment_cancelled", "This payment was cancelled.");
  }

  const packId = payment.metadata?.packId;
  const pack =
    typeof packId === "string" ? await prisma.rollPack.findFirst({ where: { id: packId, active: true } }) : null;

  if (!pack) throw HttpError.badRequest("unknown_pack", "That Roll pack is not on sale.");

  // The critical check. The client picks the amount in Pi.createPayment(), so without this
  // 0.0001 Pi could buy the 200-Roll pack.
  if (!new Prisma.Decimal(payment.amount).equals(pack.priceInPi)) {
    logger.warn("Payment amount does not match pack price", {
      paymentId,
      paid: payment.amount,
      expected: pack.priceInPi.toString(),
    });
    throw HttpError.badRequest("amount_mismatch", "The payment amount does not match the pack price.");
  }

  // upsert: a retried approve must not fail on the unique payment id.
  await prisma.purchase.upsert({
    where: { piPaymentId: paymentId },
    update: {},
    create: { userId: user.id, piPaymentId: paymentId, packId: pack.id, piAmount: pack.priceInPi, rolls: pack.rolls },
  });

  if (!payment.status.developer_approved) await piPlatform.approvePayment(paymentId);

  logger.info("Payment approved", { userId: user.id, paymentId, packId: pack.id });
}

/** A parallel request may have completed it first, and Pi refuses a second complete. */
async function completeOnPi(paymentId: string, txid: string): Promise<void> {
  try {
    await piPlatform.completePayment(paymentId, txid);
  } catch (err) {
    const latest = await piPlatform.getPayment(paymentId);
    if (!latest.status.developer_completed) throw err;
  }
}

/**
 * Settles a payment: credits it if the user signed, cancels it if they never did. Serves both
 * onReadyForServerCompletion and onIncompletePaymentFound, and is safe to call again.
 */
export async function complete(user: CurrentUser, paymentId: string): Promise<PaymentReceipt> {
  const purchase = await prisma.purchase.findUnique({ where: { piPaymentId: paymentId } });

  if (!purchase) throw HttpError.notFound("purchase_not_found", "We have no record of that payment.");
  if (purchase.userId !== user.id) throw notYours();
  if (purchase.status === "completed") return toReceipt(purchase, await ledger.getBalance(user.id));

  const payment = await piPlatform.getPayment(paymentId);

  if (!payment.transaction) {
    // Never signed. Cancel it on Pi too, or the SDK keeps reporting it as incomplete.
    if (!payment.status.cancelled && !payment.status.user_cancelled) await piPlatform.cancelPayment(paymentId);

    const cancelled = await prisma.purchase.update({ where: { piPaymentId: paymentId }, data: { status: "cancelled" } });
    return toReceipt(cancelled, await ledger.getBalance(user.id));
  }

  // The txid comes from Pi, never from the client. Called outside the transaction below so
  // no row lock is held while Pi answers.
  const { txid } = payment.transaction;
  if (!payment.status.developer_completed) await completeOnPi(paymentId, txid);

  const settled = await prisma.$transaction(async (tx) => {
    // Parallel completes queue here; the second sees `completed` and credits nothing.
    const [locked] = await tx.$queryRaw<Array<{ status: string }>>`
      SELECT status FROM purchases WHERE pi_payment_id = ${paymentId} FOR UPDATE
    `;
    if (locked.status === "completed") return tx.purchase.findUniqueOrThrow({ where: { piPaymentId: paymentId } });

    const updated = await tx.purchase.update({
      where: { piPaymentId: paymentId },
      data: { status: "completed", txid, completedAt: new Date() },
    });

    await ledger.credit(
      "purchase",
      { userId: user.id, amount: updated.rolls, ref: paymentId, idempotencyKey: `purchase:${paymentId}` },
      tx,
    );

    return updated;
  });

  logger.info("Payment completed", { userId: user.id, paymentId, txid, rolls: settled.rolls });

  return toReceipt(settled, await ledger.getBalance(user.id));
}

/** The user closed the wallet dialog. Never touches a completed purchase. */
export async function cancel(user: CurrentUser, paymentId: string): Promise<void> {
  // updateMany so an unknown id, someone else's id and a settled one all quietly do nothing,
  // without revealing which it was.
  await prisma.purchase.updateMany({
    where: { piPaymentId: paymentId, userId: user.id, status: "pending" },
    data: { status: "cancelled" },
  });
}
