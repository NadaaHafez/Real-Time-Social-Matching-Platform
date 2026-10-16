import { z } from "zod";

import { ledgerEntryTypeSchema } from "../generated/prisma";

// ============================================================================
// REQUESTS
// ============================================================================

export const ledgerQuerySchema = z.object({
  cursor: z.string().uuid().optional().describe("`nextCursor` from the previous page. Omit for the first page."),
  limit: z.coerce.number().int().min(1).max(100).optional().describe("Entries per page, 1-100. Defaults to 20."),
});
export type LedgerQuery = z.infer<typeof ledgerQuerySchema>;

// ============================================================================
// RESPONSES
// ============================================================================

export const rollsBalanceSchema = z
  .object({
    available: z.number().int().describe("Spendable now."),
    held: z.number().int().describe("Reserved by an in-flight roll. Not spendable, not yet spent."),
  })
  .describe("Always equals the sum of the user's ledger entries. Clients show it, never compute it.");
export type RollsBalance = z.infer<typeof rollsBalanceSchema>;

export const ledgerEntrySchema = z.object({
  id: z.string(),
  type: ledgerEntryTypeSchema,
  amount: z.number().int().describe("Signed: positive credits, negative debits."),
  ref: z.string().nullable().describe("Context, like `onboarding` or `streak:day:3`."),
  createdAt: z.string().datetime(),
});
export type LedgerEntry = z.infer<typeof ledgerEntrySchema>;

export const ledgerPageSchema = z
  .object({
    items: z.array(ledgerEntrySchema),
    nextCursor: z.string().nullable().describe("Send as `cursor` for the next page. Null on the last page."),
  })
  .describe("Wallet history, newest first. Cursor-paged so new entries never shift a page.");
export type LedgerPage = z.infer<typeof ledgerPageSchema>;

export const dailyStreakSchema = z
  .object({
    day: z.number().int().describe("Position in the reward cycle, from 1. Restarts after the last day."),
    bestStreak: z.number().int().describe("Longest unbroken run ever. Does not restart."),
    claimedToday: z.boolean(),
    bonusRolls: z.number().int().describe("Today's reward. Already granted once `claimedToday` is true."),
  })
  .describe("Days are UTC. Missing a day restarts at day 1. Only claiming counts, not opening the app.");
export type DailyStreak = z.infer<typeof dailyStreakSchema>;

export const claimStreakResponseSchema = z
  .object({ streak: dailyStreakSchema, balance: rollsBalanceSchema })
  .describe("The streak and balance after claiming, so neither needs re-fetching.");
export type ClaimStreakResponse = z.infer<typeof claimStreakResponseSchema>;

// ============================================================================
// OPENAPI COMPONENTS
// ============================================================================

export const rollsSchemaComponents = {
  RollsBalance: rollsBalanceSchema,
  LedgerEntry: ledgerEntrySchema,
  LedgerPage: ledgerPageSchema,
  DailyStreak: dailyStreakSchema,
  ClaimStreakResponse: claimStreakResponseSchema,
};
