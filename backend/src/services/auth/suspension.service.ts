import type { UserStatus } from "@chat-roulette/shared";

import prisma from "../../config/database";

/**
 * Suspensions that end by themselves, with no scheduled job: every request already
 * re-reads `status`, so an expired suspension is cleared the moment its holder next shows
 * up, which is the only moment it matters.
 */
interface Suspendable {
  id: string;
  status: UserStatus;
  suspendedUntil: Date | null;
}

/**
 * True if the account may act, clearing an expired suspension as a side effect.
 *
 * A ban has no end date, so it never passes. A suspension without an end date stays until
 * someone lifts it by hand.
 */
export async function isServable(user: Suspendable): Promise<boolean> {
  if (user.status === "active") return true;
  if (user.status !== "suspended") return false;
  if (!user.suspendedUntil || user.suspendedUntil > new Date()) return false;

  await prisma.user.update({
    where: { id: user.id },
    data: { status: "active", suspendedUntil: null },
  });

  return true;
}

/** "This account is suspended until …". Bans get no date, having no end. */
export function blockedMessage(user: Suspendable): string {
  if (user.status === "banned") return "This account has been banned.";
  if (!user.suspendedUntil) return "This account is suspended.";
  return `This account is suspended until ${user.suspendedUntil.toUTCString()}.`;
}
