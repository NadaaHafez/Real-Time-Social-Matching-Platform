import { z } from "zod";

import { countryCodeSchema } from "./common.schema";
import { rollsBalanceSchema } from "./rolls.schema";

// ============================================================================
// HTTP RESPONSES
// ============================================================================

export const rollResponseSchema = z
  .object({
    ticketId: z.string(),
    rollCost: z.number().int().describe("Rolls held for this search: the base plus each filter that is on."),
    expiresAt: z.string().datetime().describe("When the search gives up and refunds."),
    balance: rollsBalanceSchema,
  })
  .describe("Searching. The outcome arrives on the socket: `match:found` or `match:ended`.");
export type RollResponse = z.infer<typeof rollResponseSchema>;

export const cancelRollResponseSchema = z.object({
  refunded: z.number().int(),
  balance: rollsBalanceSchema,
});
export type CancelRollResponse = z.infer<typeof cancelRollResponseSchema>;

export const queueStatsSchema = z.object({
  waiting: z.number().int().describe("People searching right now."),
});
export type QueueStats = z.infer<typeof queueStatsSchema>;

// ============================================================================
// SOCKET EVENTS (server → client)
// ============================================================================

export const matchFoundEventSchema = z.object({
  ticketId: z.string(),
  sessionId: z.string().describe("The chat both users are now in."),
  partner: z.object({ username: z.string(), country: countryCodeSchema }),
});
export type MatchFoundEvent = z.infer<typeof matchFoundEventSchema>;

export const matchEndedEventSchema = z.object({
  ticketId: z.string(),
  reason: z.enum(["expired", "cancelled"]),
  refunded: z.number().int(),
  balance: rollsBalanceSchema,
});
export type MatchEndedEvent = z.infer<typeof matchEndedEventSchema>;

export const sessionEndedEventSchema = z.object({
  sessionId: z.string(),
  reason: z.enum(["you_left", "partner_left"]),
});
export type SessionEndedEvent = z.infer<typeof sessionEndedEventSchema>;

// ============================================================================
// SOCKET EVENTS (client → server)
// ============================================================================

export const sessionLeaveEventSchema = z.object({ sessionId: z.string().min(1) });
export type SessionLeaveEvent = z.infer<typeof sessionLeaveEventSchema>;

/** Every socket.emit callback gets one of these. */
export type SocketAck = { ok: true } | { ok: false; error: string; message: string };

/** Socket.IO's typed-events maps: `new Server<ClientToServerEvents, ServerToClientEvents>()`. */
export interface ServerToClientEvents {
  "match:found": (event: MatchFoundEvent) => void;
  "match:ended": (event: MatchEndedEvent) => void;
  "session:ended": (event: SessionEndedEvent) => void;
}

export interface ClientToServerEvents {
  "session:leave": (event: SessionLeaveEvent, ack: (result: SocketAck) => void) => void;
}

// ============================================================================
// OPENAPI COMPONENTS
// ============================================================================

export const matchmakingSchemaComponents = {
  RollResponse: rollResponseSchema,
  CancelRollResponse: cancelRollResponseSchema,
  QueueStats: queueStatsSchema,
  MatchFoundEvent: matchFoundEventSchema,
  MatchEndedEvent: matchEndedEventSchema,
  SessionEndedEvent: sessionEndedEventSchema,
};
