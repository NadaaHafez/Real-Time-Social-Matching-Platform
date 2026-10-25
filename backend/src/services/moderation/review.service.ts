import type {
  ReportDetail,
  ReportListQuery,
  ReportsPage,
  ReportSummary,
  ResolveReportRequest,
} from "@social-matching/shared";
import { z } from "zod";

import prisma from "../../config/database";
import logger from "../../config/logger";
import { disconnectUser } from "../../realtime/socket";
import type { CurrentUser } from "../../types/express";
import { HttpError } from "../../utils/httpError";
import { cancelSearchOf } from "../matchmaking/matchmaking.service";
import { endSession, openSessionOf } from "../sessions/session.service";

/** The moderator side of reports: the queue, one report, and closing it. */

const DEFAULT_PAGE_SIZE = 20;

const SUMMARY_FIELDS = {
  id: true,
  sessionId: true,
  reason: true,
  note: true,
  status: true,
  action: true,
  createdAt: true,
  reporter: { select: { id: true, username: true } },
  reportedUser: {
    select: { id: true, username: true, status: true, _count: { select: { reportsAgainst: true } } },
  },
} as const;

type SummaryRow = NonNullable<Awaited<ReturnType<typeof findSummary>>>;
const findSummary = (id: string) => prisma.report.findUnique({ where: { id }, select: SUMMARY_FIELDS });

function toSummary(row: SummaryRow): ReportSummary {
  return {
    id: row.id,
    sessionId: row.sessionId,
    reason: row.reason,
    note: row.note,
    status: row.status,
    action: row.action,
    createdAt: row.createdAt.toISOString(),
    reporter: row.reporter,
    reported: {
      id: row.reportedUser.id,
      username: row.reportedUser.username,
      status: row.reportedUser.status,
      reportCount: row.reportedUser._count.reportsAgainst,
    },
  };
}

// ============================================================================
// READ
// ============================================================================

/** Pending: oldest first, so nothing waits forever. Closed: newest first. */
export async function listReports({ status = "pending", cursor, limit = DEFAULT_PAGE_SIZE }: ReportListQuery): Promise<ReportsPage> {
  const direction = status === "pending" ? "asc" : "desc";

  const rows = await prisma.report.findMany({
    where: { status },
    orderBy: [{ createdAt: direction }, { id: direction }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: SUMMARY_FIELDS,
  });

  const page = rows.slice(0, limit);
  return { items: page.map(toSummary), nextCursor: rows.length > limit ? page[page.length - 1].id : null };
}

/** The evidence as stored by createReport. Parsed, since a Json column has no type. */
const storedMessagesSchema = z.array(z.object({ senderId: z.string(), body: z.string(), sentAt: z.string() }));

export async function getReport(reportId: string): Promise<ReportDetail> {
  const row = await prisma.report.findUnique({
    where: { id: reportId },
    select: {
      ...SUMMARY_FIELDS,
      messages: true,
      reviewNote: true,
      reviewedAt: true,
      reviewedBy: { select: { username: true } },
    },
  });

  if (!row) throw HttpError.notFound("report_not_found", "No report with that id.");

  const messages = storedMessagesSchema.parse(row.messages).map((line) => ({
    from: line.senderId === row.reporter.id ? ("reporter" as const) : ("reported" as const),
    body: line.body,
    sentAt: line.sentAt,
  }));

  const review = row.reviewedAt
    ? { by: row.reviewedBy?.username ?? "(deleted moderator)", note: row.reviewNote, at: row.reviewedAt.toISOString() }
    : null;

  return { ...toSummary(row), messages, review };
}

// ============================================================================
// RESOLVE
// ============================================================================

/** What happens to the reported account for each action. */
function accountChange({ action, suspendDays }: ResolveReportRequest) {
  switch (action) {
    case "warn":
      return { warnedAt: new Date() };
    case "suspend":
      return { status: "suspended" as const, suspendedUntil: new Date(Date.now() + suspendDays! * 24 * 60 * 60 * 1000) };
    case "ban":
      return { status: "banned" as const, suspendedUntil: null };
    case "dismiss":
      return null;
  }
}

/**
 * The account cannot act any more, so it should not still be acting: end its chat, refund its
 * search, close its sockets. HTTP needs nothing: requireUser re-reads the status every request.
 */
async function removeFromLiveFeatures(userId: string): Promise<void> {
  await cancelSearchOf(userId);

  const sessionId = openSessionOf(userId);
  if (sessionId) await endSession(sessionId, userId, "moderated");

  disconnectUser(userId);
}

/** Closes a report once. A second attempt is refused, so a decision cannot be quietly rewritten. */
export async function resolveReport(reportId: string, moderator: CurrentUser, input: ResolveReportRequest): Promise<ReportDetail> {
  const report = await prisma.report.findUnique({
    where: { id: reportId },
    select: { reportedUserId: true, reportedUser: { select: { role: true } } },
  });

  if (!report) throw HttpError.notFound("report_not_found", "No report with that id.");

  // Moderators must not be able to lock each other, or the owner, out.
  if (report.reportedUser.role !== "user") {
    throw HttpError.forbidden("cannot_action_staff", "This account has a staff role and cannot be actioned here.");
  }

  const change = accountChange(input);

  await prisma.$transaction(async (tx) => {
    // `status: pending` in the filter: if two moderators resolve at once, only one wins.
    const { count } = await tx.report.updateMany({
      where: { id: reportId, status: "pending" },
      data: {
        status: input.action === "dismiss" ? "dismissed" : "actioned",
        action: input.action,
        reviewedById: moderator.id,
        reviewNote: input.note,
        reviewedAt: new Date(),
      },
    });

    if (count === 0) throw HttpError.conflict("report_already_resolved", "This report has already been closed.");

    if (change) await tx.user.update({ where: { id: report.reportedUserId }, data: change });
  });

  if (input.action === "suspend" || input.action === "ban") {
    await removeFromLiveFeatures(report.reportedUserId);
  }

  logger.info("Report resolved", {
    reportId,
    action: input.action,
    reportedUserId: report.reportedUserId,
    moderatorId: moderator.id,
    category: "moderation",
  });

  return getReport(reportId);
}
