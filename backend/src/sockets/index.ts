import {
  sendMessageEventSchema,
  sessionLeaveEventSchema,
  typingEventSchema,
} from "@social-matching/shared";

import { handleEvent, IoSocket, isOnline } from "../realtime/socket";
import * as chatService from "../services/chat/chat.service";
import * as matchmakingService from "../services/matchmaking/matchmaking.service";
import * as sessionService from "../services/sessions/session.service";

/**
 * Every client → server event, like a routes file: validate with the shared schema, then call
 * the service. Services never see a socket.
 */
export function registerSocketHandlers(socket: IoSocket): void {
  const userId = socket.data.user.id;

  socket.on(
    "session:leave",
    handleEvent(sessionLeaveEventSchema, ({ sessionId }) => sessionService.leaveSession(userId, sessionId)),
  );

  socket.on(
    "chat:message",
    handleEvent(sendMessageEventSchema, ({ sessionId, body }) => chatService.sendMessage(userId, sessionId, body)),
  );

  socket.on(
    "chat:typing",
    handleEvent(typingEventSchema, ({ sessionId, typing }) => chatService.setTyping(userId, sessionId, typing)),
  );

  socket.on("disconnect", () => {
    // Only when the user's last socket closes; another device may still be listening.
    if (!isOnline(userId)) matchmakingService.userWentOffline(userId);
  });
}
