import type { ClaimStreakResponse, DailyStreak } from "@social-matching/shared";

import prisma from "../../config/database";
import { HttpError } from "../../utils/httpError";
import { getSettings } from "../settings/settings.service";
import * as ledger from "./ledger.service";

/**
 * No streak table: each claim is a ledger entry keyed `streak:<userId>:<YYYY-MM-DD>`. The
 * unique key allows one claim per UTC day, and the entries are the record of claimed days.
 */

const keyPrefix = (userId: string) => `streak:${userId}:`;

const utcDay = (date: Date) => date.toISOString().slice(0, 10);

function shiftDay(day: string, by: number): string {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + by);
  return utcDay(date);
}

async function claimedDays(userId: string): Promise<Set<string>> {
  const prefix = keyPrefix(userId);
  const entries = await prisma.ledgerEntry.findMany({
    where: { userId, type: "bonus", idempotencyKey: { startsWith: prefix } },
    select: { idempotencyKey: true },
  });

  return new Set(entries.map((entry) => entry.idempotencyKey!.slice(prefix.length)));
}

/** Length of the unbroken run ending on `day`. */
function runEndingAt(days: Set<string>, day: string): number {
  let length = 0;
  for (let cursor = day; days.has(cursor); cursor = shiftDay(cursor, -1)) length += 1;
  return length;
}

function longestRun(days: Set<string>): number {
  let best = 0;
  for (const day of days) {
    // Measure only from the last day of each run, so every run is counted once.
    if (!days.has(shiftDay(day, 1))) best = Math.max(best, runEndingAt(days, day));
  }
  return best;
}

async function streakOn(userId: string, today: string): Promise<DailyStreak> {
  const [{ streakRewards }, days] = await Promise.all([getSettings(), claimedDays(userId)]);

  // An unclaimed today does not break the run until it has passed.
  const claimedToday = days.has(today);
  const runLength = runEndingAt(days, claimedToday ? today : shiftDay(today, -1));
  const position = claimedToday ? runLength : runLength + 1;
  const day = ((position - 1) % streakRewards.length) + 1;

  return { day, bestStreak: longestRun(days), claimedToday, bonusRolls: streakRewards[day - 1] };
}

export function getStreak(userId: string): Promise<DailyStreak> {
  return streakOn(userId, utcDay(new Date()));
}

export async function claimStreak(userId: string): Promise<ClaimStreakResponse> {
  // One `today` for the whole claim, so a request across midnight cannot mix two days.
  const today = utcDay(new Date());
  const before = await streakOn(userId, today);

  const alreadyClaimed = () => HttpError.conflict("already_claimed_today", "You have already claimed today.");
  if (before.claimedToday) throw alreadyClaimed();

  const { applied, balance } = await ledger.credit("bonus", {
    userId,
    amount: before.bonusRolls,
    ref: `streak:day:${before.day}`,
    idempotencyKey: `${keyPrefix(userId)}${today}`,
  });

  // Lost a race with a parallel claim: the key let only one through.
  if (!applied) throw alreadyClaimed();

  return { streak: await streakOn(userId, today), balance };
}
