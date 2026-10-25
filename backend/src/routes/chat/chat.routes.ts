import { Router } from "express";

import { currentChatResponseSchema, reportRequestSchema } from "@social-matching/shared";

import * as chatController from "../../controllers/chat/chat.controller";
import { buildRouteSpec, errorResponse } from "../../docs/defineRoute";
import { requireUser } from "../../middleware/auth";
import { validateBody } from "../../middleware/validation";

const router = Router();

// ============================================================================
// OPENAPI PATH SPECS
// ============================================================================

const SOCKET_EVENTS =
  "Messages travel over Socket.IO, never HTTP, and are not stored:\n\n" +
  "- send `chat:message { sessionId, body }` (ack: `{ ok }` or `{ ok: false, error }`, e.g. `rate_limited`)\n" +
  "- send `chat:typing { sessionId, typing }`\n" +
  "- receive `chat:message` (`ChatMessage`, `author` is `me` or `partner`) and `chat:typing`\n" +
  "- send `session:leave { sessionId }` to end the chat";

const getCurrentSpec = buildRouteSpec({
  summary: "The chat you are in, if any",
  description: `For a client that reloaded mid-chat. Earlier messages are gone; new ones keep arriving.\n\n${SOCKET_EVENTS}`,
  tags: ["Chat"],
  successResponse: { status: 200, description: "The open chat, or `chat: null`.", dataRef: currentChatResponseSchema },
});

const reportSpec = buildRouteSpec({
  summary: "Report your chat partner",
  description:
    "Saves the chat's last messages as evidence, ends the chat, and stops the two of you " +
    "being matched again for Settings.blockHours (72 h by default). Your partner is only " +
    "told you left.",
  tags: ["Chat"],
  body: reportRequestSchema,
  successResponse: { status: 204, description: "Reported, and the chat is over." },
  errors: ["validation", "unauthorized", "forbidden", "rateLimited", "internal"],
  extraResponses: {
    404: errorResponse("Not in that open chat — `session_not_found`."),
  },
});

export const chatRoutePaths = {
  "/chat/current": { get: getCurrentSpec },
  "/chat/report": { post: reportSpec },
};

// ============================================================================
// CHAT ROUTES
// ============================================================================

router.use(requireUser);

router.get("/current", chatController.getCurrent);
router.post("/report", validateBody(reportRequestSchema), chatController.report);

export default router;
