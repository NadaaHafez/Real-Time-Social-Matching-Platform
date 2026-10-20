import type { LedgerEntryType, RollsBalance } from "@social-matching/shared";

import prisma, { TransactionClient } from "../../config/database";
import { HttpError } from "../../utils/httpError";

/**
 * The only code that moves Rolls. Every movement locks the balance row, then writes its
 * ledger entry and the balance change in one transaction, so `available + held` always
 * equals the sum of the user's entries.
 */

interface Movement {
  userId: string;
  /** Always positive. The operation decides the direction. */
  amount: number;
  ref?: string;
  /** A repeat with the same key changes nothing. */
  idempotencyKey?: string;
}

const EMPTY: RollsBalance = { available: 0, held: 0 };

/** Locks the row until the transaction ends, creating it on first use. */
async function lockBalance(tx: TransactionClient, userId: string): Promise<RollsBalance> {
  await tx.$executeRaw`INSERT INTO balances (user_id) VALUES (${userId}) ON CONFLICT DO NOTHING`;

  // FOR UPDATE makes concurrent movements for one user wait their turn. Prisma has no API for it.
  const [row] = await tx.$queryRaw<RollsBalance[]>`
    SELECT available, held FROM balances WHERE user_id = ${userId} FOR UPDATE
  `;
  return row;
}

/**
 * Checked before inserting, not by catching the unique violation: a failed statement aborts
 * the whole Postgres transaction. Safe because the caller already holds the row lock.
 */
async function alreadyApplied(tx: TransactionClient, idempotencyKey?: string): Promise<boolean> {
  if (!idempotencyKey) return false;

  const existing = await tx.ledgerEntry.findUnique({ where: { idempotencyKey }, select: { id: true } });
  return existing !== null;
}

function assertPositive(amount: number) {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error(`Roll amounts must be positive integers, got ${amount}`);
  }
}

export async function getBalance(userId: string): Promise<RollsBalance> {
  const balance = await prisma.balance.findUnique({ where: { userId }, select: { available: true, held: true } });
  return balance ?? EMPTY;
}

/** Joins the caller's transaction if there is one, otherwise opens its own. */
function run<T>(tx: TransactionClient | undefined, fn: (tx: TransactionClient) => Promise<T>): Promise<T> {
  return tx ? fn(tx) : prisma.$transaction(fn);
}

/**
 * Adds Rolls to `available`. `applied` is false when the idempotency key was already used.
 * Pass `tx` to make the credit part of a larger write, like completing a purchase.
 */
export async function credit(
  type: Extract<LedgerEntryType, "welcome" | "bonus" | "purchase">,
  { userId, amount, ref, idempotencyKey }: Movement,
  tx?: TransactionClient,
): Promise<{ applied: boolean; balance: RollsBalance }> {
  assertPositive(amount);

  return run(tx, async (tx) => {
    const balance = await lockBalance(tx, userId);

    if (await alreadyApplied(tx, idempotencyKey)) return { applied: false, balance };

    await tx.ledgerEntry.create({ data: { userId, type, amount, ref, idempotencyKey } });

    const updated = await tx.balance.update({
      where: { userId },
      data: { available: { increment: amount } },
      select: { available: true, held: true },
    });

    return { applied: true, balance: updated };
  });
}

/**
 * Spends Rolls from `available` on something kept forever. The caller grants the item only
 * when `applied` is true, so a repeated key can never grant it twice.
 */
export async function unlock(
  { userId, amount, ref, idempotencyKey }: Movement,
  tx?: TransactionClient,
): Promise<{ applied: boolean; balance: RollsBalance }> {
  assertPositive(amount);

  return run(tx, async (tx) => {
    const balance = await lockBalance(tx, userId);

    if (await alreadyApplied(tx, idempotencyKey)) return { applied: false, balance };

    // After the lock, so two parallel purchases cannot both pass this on the same Rolls.
    if (balance.available < amount) {
      throw HttpError.badRequest("insufficient_rolls", "You do not have enough Rolls for this.");
    }

    await tx.ledgerEntry.create({ data: { userId, type: "unlock", amount: -amount, ref, idempotencyKey } });

    const updated = await tx.balance.update({
      where: { userId },
      data: { available: { decrement: amount } },
      select: { available: true, held: true },
    });

    return { applied: true, balance: updated };
  });
}
