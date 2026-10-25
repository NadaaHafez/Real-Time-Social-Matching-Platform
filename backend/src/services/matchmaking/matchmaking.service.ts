import type { CancelRollResponse, CountryCode, QueueStats, RollResponse, RollsBalance } from "@social-matching/shared";

import prisma from "../../config/database";
import logger from "../../config/logger";
import { emitToUser, isOnline } from "../../realtime/socket";
import type { CurrentUser } from "../../types/express";
import { HttpError } from "../../utils/httpError";
import { lockSnapshot, rollCostOf } from "../filters/filters.service";
import { blockedPartnersOf } from "../moderation/block.service";
import * as ledger from "../rolls/ledger.service";
import { createSession, markOpen, openSessionOf, partnerSummary } from "../sessions/session.service";
import { getSettings } from "../settings/settings.service";
import { pairWaiting, WaitingTicket } from "./pairing";

/**
 * The queue lives in memory and a background pass pairs it, so searching costs no database
 * reads. The database sees each roll twice: when it starts (ticket + hold) and when it ends
 * (spend on a match, refund otherwise). One server instance only.
 */

const PASS_INTERVAL_MS = 500;
/** A network blip should not cost someone their search. */
const DISCONNECT_GRACE_MS = 5_000;

/** Insertion order is roll order, so iterating gives oldest first. */
const waiting = new Map<string, WaitingTicket>();
/** userId → ticketId while a roll is live. `PENDING` while it is being created. */
const ticketByUser = new Map<string, string>();
const PENDING = "pending";

function forget(ticket: { id: string; userId: string }): void {
  waiting.delete(ticket.id);
  if (ticketByUser.get(ticket.userId) === ticket.id) ticketByUser.delete(ticket.userId);
}

// ============================================================================
// ROLL
// ============================================================================

export async function roll(user: CurrentUser): Promise<RollResponse> {
  // Checked and claimed with no await between, so a double tap cannot start two rolls.
  if (ticketByUser.has(user.id)) throw HttpError.conflict("already_rolling", "You are already looking for someone.");
  ticketByUser.set(user.id, PENDING);

  try {
    // The outcome arrives on the socket; without one, a match would go to nobody.
    if (!isOnline(user.id)) throw HttpError.conflict("not_connected", "Connect to the live server before rolling.");
    if (openSessionOf(user.id)) throw HttpError.conflict("already_chatting", "Leave your current chat before rolling.");

    const profile = await prisma.user.findUnique({
      where: { id: user.id },
      select: { age: true, gender: true, country: true },
    });

    if (!profile?.age || !profile.gender || !profile.country) {
      throw HttpError.badRequest("profile_incomplete", "Finish your profile before rolling.");
    }

    const settings = await getSettings();
    const expiresAt = new Date(Date.now() + settings.matchTimeoutSeconds * 1000);
    const blocked = await blockedPartnersOf(user.id, settings.blockHours);

    // Ticket and hold together: a hold with no ticket would strand Rolls, a ticket with no
    // hold would let them be spent twice.
    const { ticket, filters, balance } = await prisma.$transaction(async (tx) => {
      const filters = await lockSnapshot(tx, user.id);
      const rollCost = rollCostOf(filters, settings);

      const ticket = await tx.matchTicket.create({
        data: { userId: user.id, rollCost, expiresAt },
        select: { id: true, rollCost: true },
      });

      const { balance } = await ledger.hold(
        { userId: user.id, amount: rollCost, ref: ticket.id, idempotencyKey: `hold:${ticket.id}` },
        tx,
      );

      return { ticket, filters, balance };
    });

    waiting.set(ticket.id, {
      id: ticket.id,
      userId: user.id,
      username: user.username,
      rollCost: ticket.rollCost,
      expiresAt: expiresAt.getTime(),
      filters,
      // Only ever written by updateProfile, after validation against the shared list.
      profile: { age: profile.age, gender: profile.gender, country: profile.country as CountryCode },
      blocked,
    });
    ticketByUser.set(user.id, ticket.id);

    return { ticketId: ticket.id, rollCost: ticket.rollCost, expiresAt: expiresAt.toISOString(), balance };
  } catch (err) {
    if (ticketByUser.get(user.id) === PENDING) ticketByUser.delete(user.id);
    throw err;
  }
}

// ============================================================================
// SETTLING
// ============================================================================

/**
 * Ends a waiting ticket and refunds its hold. The row lock makes it race-safe against a match:
 * whichever locks first wins, and the other finds the ticket no longer waiting (null).
 */
async function refundTicket(
  ticketId: string,
  outcome: "cancelled" | "expired",
): Promise<{ userId: string; refunded: number; balance: RollsBalance } | null> {
  return prisma.$transaction(async (tx) => {
    const [row] = await tx.$queryRaw<Array<{ user_id: string; status: string; roll_cost: number }>>`
      SELECT user_id, status, roll_cost FROM match_tickets WHERE id = ${ticketId} FOR UPDATE
    `;
    if (!row || row.status !== "waiting") return null;

    await tx.matchTicket.update({ where: { id: ticketId }, data: { status: outcome, settledAt: new Date() } });
    const { balance } = await ledger.refund(
      { userId: row.user_id, amount: row.roll_cost, ref: ticketId, idempotencyKey: `refund:${ticketId}` },
      tx,
    );

    return { userId: row.user_id, refunded: row.roll_cost, balance };
  });
}

/** Turns two tickets into a chat and spends both holds, or does nothing if either moved on. */
async function matchPair(a: WaitingTicket, b: WaitingTicket) {
  return prisma.$transaction(async (tx) => {
    // Locked in id order, so two passes can never deadlock on the same pair.
    const rows = await tx.$queryRaw<Array<{ id: string; status: string }>>`
      SELECT id, status FROM match_tickets WHERE id IN (${a.id}, ${b.id}) ORDER BY id FOR UPDATE
    `;
    const stillWaiting = rows.filter((row) => row.status === "waiting").map((row) => row.id);
    if (stillWaiting.length !== 2) return { session: null, stillWaiting };

    const session = await createSession(tx, a.userId, b.userId);
    await tx.matchTicket.updateMany({
      where: { id: { in: [a.id, b.id] } },
      data: { status: "matched", sessionId: session.id, settledAt: new Date() },
    });

    for (const ticket of [a, b]) {
      await ledger.spend(
        { userId: ticket.userId, amount: ticket.rollCost, ref: session.id, idempotencyKey: `spend:${ticket.id}` },
        tx,
      );
    }

    return { session, stillWaiting };
  });
}

// ============================================================================
// CANCEL
// ============================================================================

export async function cancel(user: CurrentUser): Promise<CancelRollResponse> {
  const ticketId = ticketByUser.get(user.id);
  if (!ticketId || ticketId === PENDING) throw HttpError.conflict("not_rolling", "You are not looking for anyone.");

  waiting.delete(ticketId);
  const result = await refundTicket(ticketId, "cancelled");

  // The matchmaker locked it first: the match stands, and `match:found` is on its way.
  if (!result) throw HttpError.conflict("already_matched", "You were matched just before cancelling.");

  forget({ id: ticketId, userId: user.id });
  return { refunded: result.refunded, balance: result.balance };
}

/** Cancels on the server's initiative (expiry, disconnect) and tells the user. */
async function endTicket(ticket: { id: string; userId: string }, reason: "cancelled" | "expired"): Promise<void> {
  forget(ticket);
  const result = await refundTicket(ticket.id, reason);
  if (!result) return;

  emitToUser(ticket.userId, "match:ended", { ticketId: ticket.id, reason, refunded: result.refunded, balance: result.balance });
}

// ============================================================================
// THE MATCHMAKER
// ============================================================================

async function runPass(): Promise<void> {
  const now = Date.now();

  for (const ticket of [...waiting.values()]) {
    if (ticket.expiresAt <= now) await endTicket(ticket, "expired");
  }

  for (const [a, b] of pairWaiting([...waiting.values()])) {
    // Out of the queue before the write, so the next pass cannot pick them again.
    waiting.delete(a.id);
    waiting.delete(b.id);

    const { session, stillWaiting } = await matchPair(a, b);

    if (!session) {
      // One cancelled in the meantime. The other goes back in line, keeping its place.
      for (const ticket of [a, b]) if (stillWaiting.includes(ticket.id)) waiting.set(ticket.id, ticket);
      continue;
    }

    markOpen(session);
    forget(a);
    forget(b);

    // Each side is told about the other.
    for (const [me, partner] of [[a, b], [b, a]]) {
      emitToUser(me.userId, "match:found", {
        ticketId: me.id,
        sessionId: session.id,
        partner: partnerSummary({ username: partner.username, ...partner.profile }),
      });
    }

    logger.info("Matched", { sessionId: session.id, users: [a.userId, b.userId] });
  }
}

let timer: NodeJS.Timeout | null = null;

/** Rests after each pass rather than on a fixed interval, so a slow pass never overlaps the next. */
function scheduleNextPass(): void {
  timer = setTimeout(() => {
    runPass()
      .catch((err) => logger.error("Matchmaker pass failed", { err: err instanceof Error ? err.stack : String(err) }))
      .finally(() => {
        if (timer) scheduleNextPass();
      });
  }, PASS_INTERVAL_MS);
}

/** Refunds rolls a crash or restart left waiting: the in-memory queue did not survive it. */
export async function startMatchmaker(): Promise<void> {
  const stranded = await prisma.matchTicket.findMany({ where: { status: "waiting" }, select: { id: true, userId: true } });
  for (const ticket of stranded) await refundTicket(ticket.id, "expired");
  if (stranded.length) logger.warn("Refunded rolls left waiting by a restart", { count: stranded.length });

  scheduleNextPass();
}

export function stopMatchmaker(): void {
  if (timer) clearTimeout(timer);
  timer = null;
}

export function queueStats(): QueueStats {
  return { waiting: waiting.size };
}

/** A moderator suspended or banned the user: their search ends now, refunded. */
export async function cancelSearchOf(userId: string): Promise<void> {
  const ticketId = ticketByUser.get(userId);
  if (ticketId && ticketId !== PENDING) await endTicket({ id: ticketId, userId }, "cancelled");
}

/**
 * The user's last socket closed. Their search is cancelled and refunded unless they reconnect
 * within the grace period: nobody would be there to receive a match.
 */
export function userWentOffline(userId: string): void {
  setTimeout(() => {
    const ticketId = ticketByUser.get(userId);
    if (isOnline(userId) || !ticketId || ticketId === PENDING) return;

    endTicket({ id: ticketId, userId }, "cancelled").catch((err) =>
      logger.error("Disconnect cancel failed", { err: err instanceof Error ? err.message : String(err) }),
    );
  }, DISCONNECT_GRACE_MS).unref();
}
