import type { LedgerPage, LedgerQuery, RollsBalance } from "@social-matching/shared";

import prisma from "../../config/database";
import { HttpError } from "../../utils/httpError";
import { getSettings } from "../settings/settings.service";
import * as ledger from "./ledger.service";

const DEFAULT_PAGE_SIZE = 20;

export const getBalance = ledger.getBalance;

/** One-time free Rolls once onboarding is done. Repeats return the balance unchanged. */
export async function claimWelcomeRolls(userId: string): Promise<RollsBalance> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { onboardedAt: true } });

  if (!user) throw HttpError.notFound("user_not_found", "This account no longer exists.");

  if (!user.onboardedAt) {
    throw HttpError.conflict("onboarding_incomplete", "Finish your profile before claiming welcome Rolls.");
  }

  const { welcomeRolls } = await getSettings();
  if (welcomeRolls <= 0) return ledger.getBalance(userId);

  // The key, not a flag on the user, is what makes this once per account.
  const { balance } = await ledger.credit("welcome", {
    userId,
    amount: welcomeRolls,
    ref: "onboarding",
    idempotencyKey: `welcome:${userId}`,
  });

  return balance;
}

/**
 * Wallet history, newest first. Cursor-paged: an offset would shift when new entries land
 * on top. `id` breaks ties between entries with the same `createdAt`. `hold` and `refund`
 * are left out: they carry 0 and would show as two empty rows per roll.
 */
export async function getHistory(userId: string, { cursor, limit = DEFAULT_PAGE_SIZE }: LedgerQuery): Promise<LedgerPage> {
  const rows = await prisma.ledgerEntry.findMany({
    where: { userId, type: { notIn: ["hold", "refund"] } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    // One extra row tells us whether another page exists, without a count query.
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: { id: true, type: true, amount: true, ref: true, createdAt: true },
  });

  const page = rows.slice(0, limit);
  const items = page.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));

  return { items, nextCursor: rows.length > limit ? page[page.length - 1].id : null };
}
