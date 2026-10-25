import type { CountryCode, Gender, PartnerSummary } from "@social-matching/shared";

import prisma, { TransactionClient } from "../../config/database";
import env from "../../config/env";
import logger from "../../config/logger";
import { emitToUser } from "../../realtime/socket";
import { HttpError } from "../../utils/httpError";

/**
 * Chat sessions: created by a match, ended when either side leaves.
 *
 * Open sessions are cached in memory, because every roll and every chat message asks who is
 * in which chat. Loaded at startup, updated on create and end. One server instance only.
 */

interface Participants {
  userAId: string;
  userBId: string;
}

const openSessions = new Map<string, Participants>();
const openSessionByUser = new Map<string, string>();

/** Other features (chat) clean up their own state when a session ends. */
const endedListeners: Array<(sessionId: string) => void> = [];

export function onSessionEnded(listener: (sessionId: string) => void): void {
  endedListeners.push(listener);
}

// ============================================================================
// CACHE
// ============================================================================

export async function loadOpenSessions(): Promise<void> {
  const open = await prisma.chatSession.findMany({
    where: { endedAt: null },
    select: { id: true, userAId: true, userBId: true },
  });

  for (const session of open) markOpen(session);
  logger.info("Open chat sessions loaded", { count: open.length });
}

export function markOpen(session: { id: string } & Participants): void {
  openSessions.set(session.id, { userAId: session.userAId, userBId: session.userBId });
  openSessionByUser.set(session.userAId, session.id);
  openSessionByUser.set(session.userBId, session.id);
}

export function openSessionOf(userId: string): string | null {
  return openSessionByUser.get(userId) ?? null;
}

/** The other person in `sessionId`, or null if `userId` is not in that open session. */
export function partnerIn(sessionId: string, userId: string): string | null {
  if (openSessionByUser.get(userId) !== sessionId) return null;

  const session = openSessions.get(sessionId);
  if (!session) return null;

  return session.userAId === userId ? session.userBId : session.userAId;
}

// ============================================================================
// SESSIONS
// ============================================================================

/** Inside the match transaction. Call markOpen after it commits. */
export function createSession(tx: TransactionClient, userAId: string, userBId: string) {
  return tx.chatSession.create({
    data: { userAId, userBId },
    select: { id: true, userAId: true, userBId: true },
  });
}

/** Pi usernames stay private in production. Development shows them so testers can tell accounts apart. */
export function partnerSummary(partner: {
  username: string;
  age: number;
  gender: Gender;
  country: CountryCode;
}): PartnerSummary {
  return {
    displayName: env.isProduction ? "Stranger" : partner.username,
    age: partner.age,
    gender: partner.gender,
    country: partner.country,
  };
}

export async function leaveSession(userId: string, sessionId: string): Promise<void> {
  const partnerId = partnerIn(sessionId, userId);
  if (!partnerId) throw HttpError.notFound("session_not_found", "No open chat with that id.");

  // The endedAt condition means a double leave, or both leaving at once, ends it only once.
  const { count } = await prisma.chatSession.updateMany({
    where: { id: sessionId, endedAt: null },
    data: { endedAt: new Date(), endedById: userId },
  });
  if (count === 0) return;

  openSessions.delete(sessionId);
  openSessionByUser.delete(userId);
  openSessionByUser.delete(partnerId);
  for (const listener of endedListeners) listener(sessionId);

  emitToUser(userId, "session:ended", { sessionId, reason: "you_left" });
  emitToUser(partnerId, "session:ended", { sessionId, reason: "partner_left" });
  logger.info("Chat session ended", { sessionId, endedBy: userId });
}
