import { z } from "zod";

import {
  moderationActionSchema,
  reportReasonSchema,
  reportStatusSchema,
  userRoleSchema,
  userStatusSchema,
} from "../generated/prisma";

// ============================================================================
// USER SIDE
// ============================================================================

export const reportRequestSchema = z.object({
  sessionId: z.string().min(1).describe("The open chat. Reporting ends it."),
  reason: reportReasonSchema,
  note: z.string().trim().max(500).optional().describe("Anything else the moderator should know."),
});
export type ReportRequest = z.infer<typeof reportRequestSchema>;

// ============================================================================
// ADMIN SIDE: REQUESTS
// ============================================================================

export const reportIdParamsSchema = z.object({ reportId: z.string().uuid() });
export type ReportIdParams = z.infer<typeof reportIdParamsSchema>;

export const reportListQuerySchema = z.object({
  status: reportStatusSchema.optional().describe("Defaults to `pending`, the queue."),
  cursor: z.string().uuid().optional().describe("`nextCursor` from the previous page."),
  limit: z.coerce.number().int().min(1).max(100).optional().describe("1-100. Defaults to 20."),
});
export type ReportListQuery = z.infer<typeof reportListQuerySchema>;

/** Suspensions come in fixed lengths, so moderators apply the same penalties. */
export const SUSPENSION_DAYS = [1, 7, 30] as const;

export const resolveReportRequestSchema = z
  .object({
    action: moderationActionSchema,
    suspendDays: z
      .union([z.literal(1), z.literal(7), z.literal(30)])
      .optional()
      .describe("Required with `suspend`, refused otherwise."),
    note: z.string().trim().max(1000).optional().describe("The moderator's reason, kept on the report."),
  })
  .refine((input) => (input.action === "suspend") === (input.suspendDays !== undefined), {
    message: "suspendDays goes with action `suspend`, and only with it",
    path: ["suspendDays"],
  });
export type ResolveReportRequest = z.infer<typeof resolveReportRequestSchema>;

// ============================================================================
// ADMIN SIDE: RESPONSES
// ============================================================================

export const adminMeSchema = z.object({ role: userRoleSchema });
export type AdminMe = z.infer<typeof adminMeSchema>;

export const reportSummarySchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  reason: reportReasonSchema,
  note: z.string().nullable(),
  status: reportStatusSchema,
  action: moderationActionSchema.nullable(),
  createdAt: z.string().datetime(),
  reporter: z.object({ id: z.string(), username: z.string() }),
  reported: z.object({
    id: z.string(),
    username: z.string(),
    status: userStatusSchema,
    reportCount: z.number().int().describe("Every report ever filed against them, this one included."),
  }),
});
export type ReportSummary = z.infer<typeof reportSummarySchema>;

export const reportsPageSchema = z.object({
  items: z.array(reportSummarySchema),
  nextCursor: z.string().nullable(),
});
export type ReportsPage = z.infer<typeof reportsPageSchema>;

export const reportDetailSchema = reportSummarySchema.extend({
  messages: z
    .array(z.object({ from: z.enum(["reporter", "reported"]), body: z.string(), sentAt: z.string().datetime() }))
    .describe("The chat's last messages, frozen when it was reported."),
  review: z
    .object({ by: z.string(), note: z.string().nullable(), at: z.string().datetime() })
    .nullable()
    .describe("Null while pending."),
});
export type ReportDetail = z.infer<typeof reportDetailSchema>;

// ============================================================================
// OPENAPI COMPONENTS
// ============================================================================

export const moderationSchemaComponents = {
  ReportRequest: reportRequestSchema,
  ResolveReportRequest: resolveReportRequestSchema,
  AdminMe: adminMeSchema,
  ReportSummary: reportSummarySchema,
  ReportsPage: reportsPageSchema,
  ReportDetail: reportDetailSchema,
};
