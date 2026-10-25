import type { ReportRequest } from "@social-matching/shared";

import prisma from "../../config/database";
import logger from "../../config/logger";
import { HttpError } from "../../utils/httpError";
import { transcriptOf } from "../chat/chat.service";
import { endSession, partnerIn } from "../sessions/session.service";
import { blockPair } from "./block.service";

/**
 * Reporting your chat partner: saves the evidence, blocks the pair, and ends the chat. The
 * reported user is only told their partner left.
 */
export async function createReport(reporterId: string, { sessionId, reason, note }: ReportRequest): Promise<void> {
  const reportedUserId = partnerIn(sessionId, reporterId);
  if (!reportedUserId) throw HttpError.notFound("session_not_found", "No open chat with that id.");

  // Copied now: the transcript is dropped from memory when the chat ends below.
  const messages = [...transcriptOf(sessionId)];

  // A report without its block, or a block without its report, is worse than neither.
  await prisma.$transaction(async (tx) => {
    await tx.report.create({ data: { sessionId, reporterId, reportedUserId, reason, note, messages } });
    await blockPair(tx, reporterId, reportedUserId);
  });

  await endSession(sessionId, reporterId, "reported");

  logger.info("Report filed", { sessionId, reporterId, reportedUserId, reason, category: "moderation" });
}
