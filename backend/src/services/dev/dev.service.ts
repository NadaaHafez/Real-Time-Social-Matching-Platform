import type { RollsBalance, SignInResponse } from "@social-matching/shared";

import prisma from "../../config/database";
import logger from "../../config/logger";
import { signInAs } from "../auth/auth.service";
import * as ledger from "../rolls/ledger.service";

// Real Pi uids are UUIDs, so the prefix can never collide with one.
const DEV_UID_PREFIX = "dev-";

/** Load-test bots sign in as `bot_…`; the cleanup below deletes exactly those. */
const BOT_UID_PATTERN = `${DEV_UID_PREFIX}bot\\_%`;

/** Signs in as any username, skipping Pi. Only reachable outside production. */
export function devSignIn(username: string): Promise<SignInResponse> {
  return signInAs({ uid: `${DEV_UID_PREFIX}${username}`, username });
}

/** Free Rolls for testing, through the ledger like any other grant. */
export async function grantRolls(userId: string, amount: number): Promise<RollsBalance> {
  const { balance } = await ledger.credit("bonus", { userId, amount, ref: "dev-grant" });
  return balance;
}

/**
 * Deletes every load-test bot and, by cascade, all their data. Hard delete: raw SQL, because
 * the soft-delete extension would only mark them. Run it after a test, not during one.
 */
export async function deleteBots(): Promise<number> {
  const deleted = await prisma.$executeRaw`DELETE FROM users WHERE pi_user_id LIKE ${BOT_UID_PATTERN}`;
  logger.info("Load-test bots deleted", { deleted });
  return deleted;
}
