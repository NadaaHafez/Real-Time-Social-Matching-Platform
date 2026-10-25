import { z } from "zod";

import { partnerSummarySchema } from "./chat.schema";
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
  partner: partnerSummarySchema,
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
