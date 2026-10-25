import type {
  AdminMe,
  ReportDetail,
  ReportListQuery,
  ReportsPage,
  ResolveReportRequest,
} from "@social-matching/shared";

import * as reviewService from "../../services/moderation/review.service";
import { asyncHandler } from "../../utils/asyncHandler";

// requireUser and requireRole run before every route here, so `currentUser!` is safe.

export const getMe = asyncHandler<AdminMe>(async (req, res) => {
  res.status(200).json({ role: req.currentUser!.role });
});

export const listReports = asyncHandler<ReportsPage, unknown, ReportListQuery>(async (req, res) => {
  res.status(200).json(await reviewService.listReports(req.query));
});

export const getReport = asyncHandler<ReportDetail>(async (req, res) => {
  res.status(200).json(await reviewService.getReport(req.params.reportId));
});

export const resolveReport = asyncHandler<ReportDetail, ResolveReportRequest>(async (req, res) => {
  res.status(200).json(await reviewService.resolveReport(req.params.reportId, req.currentUser!, req.body));
});
