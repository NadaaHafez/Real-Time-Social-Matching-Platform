import { z } from "zod";

import { genderSchema } from "../generated/prisma";
import { countryCodeSchema } from "./common.schema";

/** Longest message accepted. A chat line, not a document. */
export const MAX_MESSAGE_LENGTH = 1000;

// ============================================================================
// PARTNER
// ============================================================================

export const partnerSummarySchema = z
  .object({
    displayName: z.string().describe('"Stranger" in production; the username in development, so testers can tell accounts apart.'),
    age: z.number().int(),
    gender: genderSchema,
    country: countryCodeSchema,
  })
  .describe("Who you are talking to. Never their Pi username in production.");
export type PartnerSummary = z.infer<typeof partnerSummarySchema>;

// ============================================================================
// HTTP
// ============================================================================

export const currentChatSchema = z.object({
  sessionId: z.string(),
  startedAt: z.string().datetime(),
  partner: partnerSummarySchema,
});
export type CurrentChat = z.infer<typeof currentChatSchema>;

export const currentChatResponseSchema = z
  .object({ chat: currentChatSchema.nullable().describe("Null when not in a chat.") })
  .describe("For a client that reloaded mid-chat. Earlier messages are not kept, so only new ones appear.");
export type CurrentChatResponse = z.infer<typeof currentChatResponseSchema>;

// ============================================================================
// SOCKET EVENTS
// ============================================================================

/** client → server */
export const sendMessageEventSchema = z.object({
  sessionId: z.string().min(1),
  body: z.string().trim().min(1, "Message is empty").max(MAX_MESSAGE_LENGTH),
});
export type SendMessageEvent = z.infer<typeof sendMessageEventSchema>;

/** client → server, and server → the partner */
export const typingEventSchema = z.object({
  sessionId: z.string().min(1),
  typing: z.boolean(),
});
export type TypingEvent = z.infer<typeof typingEventSchema>;

/** server → both users. `author` is relative to whoever receives it. */
export const chatMessageSchema = z.object({
  sessionId: z.string(),
  id: z.string(),
  author: z.enum(["me", "partner"]),
  body: z.string(),
  sentAt: z.string().datetime(),
});
export type ChatMessage = z.infer<typeof chatMessageSchema>;

// ============================================================================
// OPENAPI COMPONENTS
// ============================================================================

export const chatSchemaComponents = {
  PartnerSummary: partnerSummarySchema,
  CurrentChat: currentChatSchema,
  CurrentChatResponse: currentChatResponseSchema,
  SendMessageEvent: sendMessageEventSchema,
  TypingEvent: typingEventSchema,
  ChatMessage: chatMessageSchema,
};
