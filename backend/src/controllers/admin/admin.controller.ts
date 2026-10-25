import type {
  AdminMe,
  AdminPack,
  AppSettings,
  ReportDetail,
  ReportListQuery,
  ReportsPage,
  ResolveReportRequest,
  SavePackRequest,
  UpdateSettingsRequest,
} from "@social-matching/shared";

import * as reviewService from "../../services/moderation/review.service";
import * as paymentsService from "../../services/payments/payments.service";
import * as settingsService from "../../services/settings/settings.service";
import { asyncHandler } from "../../utils/asyncHandler";

// requireUser and requireRole run before every route here, so `currentUser!` is safe.

export const getMe = asyncHandler<AdminMe>(async (req, res) => {
  res.status(200).json({ role: req.currentUser!.role });
});

// ============================================================================
// REPORTS (moderator)
// ============================================================================

export const listReports = asyncHandler<ReportsPage, unknown, ReportListQuery>(async (req, res) => {
  res.status(200).json(await reviewService.listReports(req.query));
});

export const getReport = asyncHandler<ReportDetail>(async (req, res) => {
  res.status(200).json(await reviewService.getReport(req.params.reportId));
});

export const resolveReport = asyncHandler<ReportDetail, ResolveReportRequest>(async (req, res) => {
  res.status(200).json(await reviewService.resolveReport(req.params.reportId, req.currentUser!, req.body));
});

// ============================================================================
// CONFIG (owner)
// ============================================================================

export const getSettings = asyncHandler<AppSettings>(async (_req, res) => {
  res.status(200).json(settingsService.toAppSettings(await settingsService.getSettings()));
});

export const updateSettings = asyncHandler<AppSettings, UpdateSettingsRequest>(async (req, res) => {
  res.status(200).json(await settingsService.updateSettings(req.body, req.currentUser!));
});

export const listPacks = asyncHandler<AdminPack[]>(async (_req, res) => {
  res.status(200).json(await paymentsService.listAllPacks());
});

export const savePack = asyncHandler<AdminPack, SavePackRequest>(async (req, res) => {
  res.status(200).json(await paymentsService.savePack(req.params.packId, req.body, req.currentUser!));
});
