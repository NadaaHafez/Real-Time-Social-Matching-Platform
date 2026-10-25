import type { ChatMessage, SendMessageEvent, TypingEvent } from "./chat.schema";
import type { MatchEndedEvent, MatchFoundEvent, SessionEndedEvent, SessionLeaveEvent } from "./matchmaking.schema";

/**
 * Every Socket.IO event, typed for both ends:
 *   new Server<ClientToServerEvents, ServerToClientEvents>()   (backend)
 *   io(url) as Socket<ServerToClientEvents, ClientToServerEvents>   (client)
 */

/** What every acknowledged client event gets back. `error` uses the same codes as HTTP. */
export type SocketAck = { ok: true } | { ok: false; error: string; message: string };

export interface ServerToClientEvents {
  "match:found": (event: MatchFoundEvent) => void;
  "match:ended": (event: MatchEndedEvent) => void;
  "session:ended": (event: SessionEndedEvent) => void;
  "chat:message": (event: ChatMessage) => void;
  "chat:typing": (event: TypingEvent) => void;
}

export interface ClientToServerEvents {
  "session:leave": (event: SessionLeaveEvent, ack: (result: SocketAck) => void) => void;
  "chat:message": (event: SendMessageEvent, ack: (result: SocketAck) => void) => void;
  "chat:typing": (event: TypingEvent) => void;
}
