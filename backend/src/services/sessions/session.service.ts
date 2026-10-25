import { sessionLeaveEventSchema, type SocketAck } from "@social-matching/shared";

import prisma, { TransactionClient } from "../../config/database";
import logger from "../../config/logger";
import { emitToUser, IoServer } from "../../realtime/socket";
import { HttpError } from "../../utils/httpError";

/**
 * Chat sessions: created by a match, ended when either side leaves. Messages arrive with the
 * chat feature.
 *
 * Who is in an open session is cached in memory, because every roll asks. Loaded once at
 * startup and updated on create and end. One server instance only.
 */
const openSessionByUser = new Map<string, string>();

export async function loadOpenSessions(): Promise<void> {
  const open = await prisma.chatSession.findMany({
    where: { endedAt: null },
    select: { id: true, userAId: true, userBId: true },
  });

  for (const session of open) markOpen(session);
  logger.info("Open chat sessions loaded", { count: open.length });
}

export function openSessionOf(userId: string): string | null {
  return openSessionByUser.get(userId) ?? null;
}

/** Inside the match transaction. Call markOpen after it commits. */
export function createSession(tx: TransactionClient, userAId: string, userBId: string) {
  return tx.chatSession.create({ data: { userAId, userBId }, select: { id: true, userAId: true, userBId: true } });
}

export function markOpen(session: { id: string; userAId: string; userBId: string }): void {
  openSessionByUser.set(session.userAId, session.id);
  openSessionByUser.set(session.userBId, session.id);
}

export async function leaveSession(userId: string, sessionId: string): Promise<void> {
  const session = await prisma.chatSession.findFirst({
    where: { id: sessionId, endedAt: null, OR: [{ userAId: userId }, { userBId: userId }] },
    select: { userAId: true, userBId: true },
  });

  if (!session) throw HttpError.notFound("session_not_found", "No open chat with that id.");

  // The endedAt condition makes a double leave, or both leaving at once, end it only once.
  const { count } = await prisma.chatSession.updateMany({
    where: { id: sessionId, endedAt: null },
    data: { endedAt: new Date(), endedById: userId },
  });
  if (count === 0) return;

  const partnerId = session.userAId === userId ? session.userBId : session.userAId;
  openSessionByUser.delete(session.userAId);
  openSessionByUser.delete(session.userBId);

  emitToUser(userId, "session:ended", { sessionId, reason: "you_left" });
  emitToUser(partnerId, "session:ended", { sessionId, reason: "partner_left" });
  logger.info("Chat session ended", { sessionId, endedBy: userId });
}

export function registerSessionHandlers(io: IoServer): void {
  io.on("connection", (socket) => {
    socket.on("session:leave", async (payload, ack) => {
      const reply: (result: SocketAck) => void = typeof ack === "function" ? ack : () => undefined;
      const parsed = sessionLeaveEventSchema.safeParse(payload);

      if (!parsed.success) {
        reply({ ok: false, error: "validation_failed", message: "sessionId is required." });
        return;
      }

      try {
        await leaveSession(socket.data.user.id, parsed.data.sessionId);
        reply({ ok: true });
      } catch (err) {
        if (err instanceof HttpError) {
          reply({ ok: false, error: err.code, message: err.message });
          return;
        }
        logger.error("session:leave failed", { err: err instanceof Error ? err.stack : String(err) });
        reply({ ok: false, error: "internal_error", message: "Something went wrong on the server." });
      }
    });
  });
}
