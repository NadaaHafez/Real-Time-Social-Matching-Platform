import { Router } from "express";

import { currentChatResponseSchema } from "@social-matching/shared";

import * as chatController from "../../controllers/chat/chat.controller";
import { buildRouteSpec } from "../../docs/defineRoute";
import { requireUser } from "../../middleware/auth";

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

export const chatRoutePaths = {
  "/chat/current": { get: getCurrentSpec },
};

// ============================================================================
// CHAT ROUTES
// ============================================================================

router.use(requireUser);

router.get("/current", chatController.getCurrent);

export default router;
