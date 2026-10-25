import type { LedgerEntryType, RollsBalance } from "@social-matching/shared";

import prisma, { TransactionClient } from "../../config/database";
import { HttpError } from "../../utils/httpError";

/**
 * The only code that moves Rolls. Every movement locks the balance row, then writes its
 * ledger entry and the balance change in one transaction, so `available + held` always
 * equals the sum of the user's entries.
 *
 *   type     | entry | available | held
 *   welcome  |  +N   |    +N     |  -
 *   bonus    |  +N   |    +N     |  -
 *   purchase |  +N   |    +N     |  -
 *   unlock   |  -N   |    -N     |  -
 *   hold     |   0   |    -N     | +N
 *   spend    |  -N   |     -     | -N
 *   refund   |   0   |    +N     | -N
 */

interface Movement {
  userId: string;
  /** Always positive. The operation decides the direction. */
  amount: number;
  ref?: string;
  /** A repeat with the same key changes nothing. */
  idempotencyKey?: string;
}

type Result = { applied: boolean; balance: RollsBalance };

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

/** Joins the caller's transaction if there is one, otherwise opens its own. */
function run<T>(tx: TransactionClient | undefined, fn: (tx: TransactionClient) => Promise<T>): Promise<T> {
  return tx ? fn(tx) : prisma.$transaction(fn);
}

/** One row of the table above, for an amount of N. */
interface Effect {
  type: LedgerEntryType;
  entry: number;
  available: number;
  held: number;
  /** Throws if the balance cannot cover it. Runs after the lock. */
  check?: (balance: RollsBalance) => void;
}

function move({ userId, amount, ref, idempotencyKey }: Movement, effect: Effect, tx?: TransactionClient) {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error(`Roll amounts must be positive integers, got ${amount}`);
  }

  return run(tx, async (tx): Promise<Result> => {
    const balance = await lockBalance(tx, userId);

    if (await alreadyApplied(tx, idempotencyKey)) return { applied: false, balance };

    effect.check?.(balance);

    await tx.ledgerEntry.create({ data: { userId, type: effect.type, amount: effect.entry, ref, idempotencyKey } });

    const updated = await tx.balance.update({
      where: { userId },
      data: { available: { increment: effect.available }, held: { increment: effect.held } },
      select: { available: true, held: true },
    });

    return { applied: true, balance: updated };
  });
}

const needsAvailable = (amount: number, message: string) => (balance: RollsBalance) => {
  if (balance.available < amount) throw HttpError.badRequest("insufficient_rolls", message);
};

// Held Rolls missing means a settle ran twice or out of order: a bug, never the user's doing.
const needsHeld = (amount: number) => (balance: RollsBalance) => {
  if (balance.held < amount) throw new Error(`Only ${balance.held} Rolls held, cannot settle ${amount}`);
};

// ============================================================================
// PUBLIC
// ============================================================================

export async function getBalance(userId: string): Promise<RollsBalance> {
  const balance = await prisma.balance.findUnique({ where: { userId }, select: { available: true, held: true } });
  return balance ?? EMPTY;
}

/**
 * Adds Rolls to `available`. `applied` is false when the idempotency key was already used.
 * Pass `tx` to make the credit part of a larger write, like completing a purchase.
 */
export function credit(
  type: Extract<LedgerEntryType, "welcome" | "bonus" | "purchase">,
  movement: Movement,
  tx?: TransactionClient,
): Promise<Result> {
  return move(movement, { type, entry: movement.amount, available: movement.amount, held: 0 }, tx);
}

/** Spends Rolls on something kept forever. Grant the item only when `applied` is true. */
export function unlock(movement: Movement, tx?: TransactionClient): Promise<Result> {
  const { amount } = movement;
  return move(
    movement,
    { type: "unlock", entry: -amount, available: -amount, held: 0, check: needsAvailable(amount, "You do not have enough Rolls for this.") },
    tx,
  );
}

/** Reserves Rolls for a roll while it searches, so they cannot be spent twice. */
export function hold(movement: Movement, tx?: TransactionClient): Promise<Result> {
  const { amount } = movement;
  return move(
    movement,
    { type: "hold", entry: 0, available: -amount, held: amount, check: needsAvailable(amount, "You do not have enough Rolls to roll.") },
    tx,
  );
}

/** A held roll is used up by a match. */
export function spend(movement: Movement, tx?: TransactionClient): Promise<Result> {
  const { amount } = movement;
  return move(movement, { type: "spend", entry: -amount, available: 0, held: -amount, check: needsHeld(amount) }, tx);
}

/** A held roll is returned: nobody was found, or the roll was cancelled. */
export function refund(movement: Movement, tx?: TransactionClient): Promise<Result> {
  const { amount } = movement;
  return move(movement, { type: "refund", entry: 0, available: amount, held: -amount, check: needsHeld(amount) }, tx);
}
