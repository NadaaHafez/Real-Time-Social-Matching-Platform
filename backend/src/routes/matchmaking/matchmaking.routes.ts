import { Router } from "express";

import { cancelRollResponseSchema, queueStatsSchema, rollResponseSchema } from "@social-matching/shared";

import * as matchmakingController from "../../controllers/matchmaking/matchmaking.controller";
import { buildRouteSpec, errorResponse } from "../../docs/defineRoute";
import { requireUser } from "../../middleware/auth";

const router = Router();

// ============================================================================
// OPENAPI PATH SPECS
// ============================================================================

const TAGS = ["Matchmaking"];

const SOCKET_EVENTS =
  "Results arrive over Socket.IO. Connect with `io(url, { auth: { token: accessToken } })`, then listen for:\n\n" +
  "- `match:found` — `MatchFoundEvent`. The Rolls are spent and the chat is open.\n" +
  "- `match:ended` — `MatchEndedEvent`. Expired or cancelled by the server (for example, after a disconnect); refunded.\n" +
  "- `session:ended` — `SessionEndedEvent`. Send `session:leave { sessionId }` to leave a chat.";

const rollSpec = buildRouteSpec({
  summary: "Start searching for a partner",
  description:
    "Holds the roll's cost (base plus each filter that is on) and joins the queue. Matching is " +
    `mutual. Needs an open socket. Disconnecting for more than 5 seconds cancels and refunds.\n\n${SOCKET_EVENTS}`,
  tags: TAGS,
  successResponse: { status: 202, description: "Searching.", dataRef: rollResponseSchema },
  extraResponses: {
    400: errorResponse("`profile_incomplete`, or not enough Rolls (`insufficient_rolls`)."),
    409: errorResponse("`already_rolling`, `already_chatting`, or no open socket (`not_connected`)."),
  },
});

const cancelSpec = buildRouteSpec({
  summary: "Stop searching",
  description: "Refunds the held Rolls.",
  tags: TAGS,
  successResponse: { status: 200, description: "Cancelled and refunded.", dataRef: cancelRollResponseSchema },
  extraResponses: {
    409: errorResponse("Nothing to cancel (`not_rolling`), or matched a moment before (`already_matched`)."),
  },
});

const queueSpec = buildRouteSpec({
  summary: "How many people are searching",
  tags: TAGS,
  successResponse: { status: 200, description: "Queue size.", dataRef: queueStatsSchema },
});

export const matchmakingRoutePaths = {
  "/matchmaking/roll": { post: rollSpec },
  "/matchmaking/cancel": { post: cancelSpec },
  "/matchmaking/queue": { get: queueSpec },
};

// ============================================================================
// MATCHMAKING ROUTES
// ============================================================================

router.use(requireUser);

router.post("/roll", matchmakingController.roll);
router.post("/cancel", matchmakingController.cancel);
router.get("/queue", matchmakingController.getQueue);

export default router;
