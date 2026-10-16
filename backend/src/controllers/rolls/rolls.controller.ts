import type {
  ClaimStreakResponse,
  DailyStreak,
  LedgerPage,
  LedgerQuery,
  RollsBalance,
} from "@social-matching/shared";

import * as rollsService from "../../services/rolls/rolls.service";
import * as streakService from "../../services/rolls/streak.service";
import { asyncHandler } from "../../utils/asyncHandler";

// requireUser runs before every route here, so `currentUser!` is safe.

export const getBalance = asyncHandler<RollsBalance>(async (req, res) => {
  res.status(200).json(await rollsService.getBalance(req.currentUser!.id));
});

export const getLedger = asyncHandler<LedgerPage, unknown, LedgerQuery>(async (req, res) => {
  // validateQuery has already parsed and coerced it.
  res.status(200).json(await rollsService.getHistory(req.currentUser!.id, req.query));
});

export const claimWelcomeRolls = asyncHandler<RollsBalance>(async (req, res) => {
  res.status(200).json(await rollsService.claimWelcomeRolls(req.currentUser!.id));
});

export const getStreak = asyncHandler<DailyStreak>(async (req, res) => {
  res.status(200).json(await streakService.getStreak(req.currentUser!.id));
});

export const claimStreak = asyncHandler<ClaimStreakResponse>(async (req, res) => {
  res.status(200).json(await streakService.claimStreak(req.currentUser!.id));
});
