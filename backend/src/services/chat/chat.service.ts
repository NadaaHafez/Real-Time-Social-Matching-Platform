import { randomUUID } from "crypto";

import type { CountryCode, CurrentChat } from "@social-matching/shared";

import prisma from "../../config/database";
import { emitToUser } from "../../realtime/socket";
import { HttpError } from "../../utils/httpError";
import { onSessionEnded, openSessionOf, partnerIn, partnerSummary } from "../sessions/session.service";

/**
 * Messages are never stored. Each live chat keeps its last few in memory, only so a report
 * has evidence to attach; they go when the chat ends. Zero database writes per message.
 */

const TRANSCRIPT_LIMIT = 20;
const RATE_LIMIT = { messages: 5, perMs: 1000 };

export interface TranscriptLine {
  senderId: string;
  body: string;
  sentAt: string;
}

const transcripts = new Map<string, TranscriptLine[]>();
const recentSends = new Map<string, number[]>();

onSessionEnded((sessionId) => transcripts.delete(sessionId));

/** For the report feature: the tail of a live chat. */
export function transcriptOf(sessionId: string): TranscriptLine[] {
  return transcripts.get(sessionId) ?? [];
}

function record(sessionId: string, line: TranscriptLine): void {
  const lines = transcripts.get(sessionId) ?? [];
  lines.push(line);
  // Only the tail is kept, so a long chat costs no more memory than a short one.
  if (lines.length > TRANSCRIPT_LIMIT) lines.shift();
  transcripts.set(sessionId, lines);
}

/** Sliding window per user, in memory. Stops one side flooding the other. */
function assertNotFlooding(userId: string): void {
  const now = Date.now();
  const recent = (recentSends.get(userId) ?? []).filter((at) => now - at < RATE_LIMIT.perMs);

  if (recent.length >= RATE_LIMIT.messages) {
    throw HttpError.tooManyRequests("rate_limited", "Slow down a little.");
  }

  recent.push(now);
  recentSends.set(userId, recent);
}

/** Throws unless `userId` is in that open session. A memory lookup, not a query. */
function partnerOrThrow(sessionId: string, userId: string): string {
  const partnerId = partnerIn(sessionId, userId);
  if (!partnerId) throw HttpError.notFound("session_not_found", "No open chat with that id.");
  return partnerId;
}

export function sendMessage(userId: string, sessionId: string, body: string): void {
  const partnerId = partnerOrThrow(sessionId, userId);
  assertNotFlooding(userId);

  const id = randomUUID();
  const sentAt = new Date().toISOString();
  record(sessionId, { senderId: userId, body, sentAt });

  // `author` is relative to the receiver, so each side gets its own copy.
  emitToUser(userId, "chat:message", { sessionId, id, author: "me", body, sentAt });
  emitToUser(partnerId, "chat:message", { sessionId, id, author: "partner", body, sentAt });
}

export function setTyping(userId: string, sessionId: string, typing: boolean): void {
  const partnerId = partnerOrThrow(sessionId, userId);
  emitToUser(partnerId, "chat:typing", { sessionId, typing });
}

/** The open chat, for a client that reloaded mid-conversation. */
export async function currentChat(userId: string): Promise<CurrentChat | null> {
  const sessionId = openSessionOf(userId);
  if (!sessionId) return null;

  const partnerId = partnerOrThrow(sessionId, userId);

  const [session, partner] = await Promise.all([
    prisma.chatSession.findUniqueOrThrow({ where: { id: sessionId }, select: { startedAt: true } }),
    prisma.user.findUniqueOrThrow({
      where: { id: partnerId },
      select: { username: true, age: true, gender: true, country: true },
    }),
  ]);

  // Only complete profiles can roll, so a chat partner always has all three.
  if (partner.age === null || partner.gender === null || partner.country === null) {
    throw new Error(`Chat partner ${partnerId} has an incomplete profile`);
  }

  return {
    sessionId,
    startedAt: session.startedAt.toISOString(),
    partner: partnerSummary({
      username: partner.username,
      age: partner.age,
      gender: partner.gender,
      country: partner.country as CountryCode,
    }),
  };
}
