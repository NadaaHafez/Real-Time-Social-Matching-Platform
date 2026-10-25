import type { CancelRollResponse, QueueStats, RollResponse } from "@social-matching/shared";

import * as matchmakingService from "../../services/matchmaking/matchmaking.service";
import { asyncHandler } from "../../utils/asyncHandler";

// requireUser runs before every route here, so `currentUser!` is safe.

export const roll = asyncHandler<RollResponse>(async (req, res) => {
  // 202: accepted and searching. The outcome comes over the socket.
  res.status(202).json(await matchmakingService.roll(req.currentUser!));
});

export const cancel = asyncHandler<CancelRollResponse>(async (req, res) => {
  res.status(200).json(await matchmakingService.cancel(req.currentUser!));
});

export const getQueue = asyncHandler<QueueStats>(async (_req, res) => {
  res.status(200).json(matchmakingService.queueStats());
});
