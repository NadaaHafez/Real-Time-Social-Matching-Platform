import { Router } from "express";

import {
  adminMeSchema,
  adminPackSchema,
  appSettingsSchema,
  legalDocumentSchema,
  packIdParamsSchema,
  publishLegalRequestSchema,
  reportDetailSchema,
  reportIdParamsSchema,
  reportListQuerySchema,
  reportsPageSchema,
  resolveReportRequestSchema,
  savePackRequestSchema,
  updateSettingsRequestSchema,
} from "@social-matching/shared";

import * as adminController from "../../controllers/admin/admin.controller";
import { arrayOf, buildRouteSpec, errorResponse } from "../../docs/defineRoute";
import { requireRole, requireUser } from "../../middleware/auth";
import { validateBody, validateParams, validateQuery } from "../../middleware/validation";

const router = Router();

// ============================================================================
// OPENAPI PATH SPECS
// ============================================================================

const TAGS = ["Admin"];
const ADMIN_ERRORS = ["validation", "unauthorized", "forbidden", "rateLimited", "internal"] as const;
const NOT_FOUND = errorResponse("No report with that id — `report_not_found`.");

const getMeSpec = buildRouteSpec({
  summary: "Your admin role",
  description: "Moderators and owners only. Roles are set in the database (`users.role`).",
  tags: TAGS,
  successResponse: { status: 200, description: "Your role.", dataRef: adminMeSchema },
});

const listReportsSpec = buildRouteSpec({
  summary: "The report queue",
  description: "Pending reports oldest first, so none waits forever. Closed ones newest first.",
  tags: TAGS,
  query: reportListQuerySchema,
  successResponse: { status: 200, description: "One page of reports.", dataRef: reportsPageSchema },
  errors: [...ADMIN_ERRORS],
});

const getReportSpec = buildRouteSpec({
  summary: "One report, with the chat's last messages",
  tags: TAGS,
  params: reportIdParamsSchema,
  successResponse: { status: 200, description: "The report.", dataRef: reportDetailSchema },
  errors: [...ADMIN_ERRORS],
  extraResponses: { 404: NOT_FOUND },
});

const resolveReportSpec = buildRouteSpec({
  summary: "Close a report",
  description:
    "`warn` shows the user a warning once. `suspend` (1, 7 or 30 days) and `ban` take effect " +
    "immediately: their chat ends, any search is refunded, and their sockets are closed. " +
    "`dismiss` changes nothing about the user. A report can be closed only once.",
  tags: TAGS,
  params: reportIdParamsSchema,
  body: resolveReportRequestSchema,
  successResponse: { status: 200, description: "The closed report.", dataRef: reportDetailSchema },
  errors: [...ADMIN_ERRORS],
  extraResponses: {
    403: errorResponse("Not a moderator (`insufficient_role`), or the user has a staff role (`cannot_action_staff`)."),
    404: NOT_FOUND,
    409: errorResponse("Already closed — `report_already_resolved`."),
  },
});

const OWNER_ONLY = errorResponse("Owners only — `insufficient_role`.");

const getSettingsSpec = buildRouteSpec({
  summary: "Read the app settings",
  description: "Owners only.",
  tags: TAGS,
  successResponse: { status: 200, description: "Every setting.", dataRef: appSettingsSchema },
  extraResponses: { 403: OWNER_ONLY },
});

const updateSettingsSpec = buildRouteSpec({
  summary: "Change app settings",
  description:
    "Owners only. Send only what changes. Applies from the next request: prices to the next roll, " +
    "the timeout to the next search. Bought slots are never taken away by lowering a limit.",
  tags: TAGS,
  body: updateSettingsRequestSchema,
  successResponse: { status: 200, description: "The settings after the change.", dataRef: appSettingsSchema },
  errors: [...ADMIN_ERRORS],
  extraResponses: { 403: OWNER_ONLY },
});

const listPacksSpec = buildRouteSpec({
  summary: "Every Roll pack, hidden ones included",
  description: "Owners only.",
  tags: TAGS,
  successResponse: { status: 200, description: "All packs.", dataSchema: arrayOf(adminPackSchema) },
  extraResponses: { 403: OWNER_ONLY },
});

const savePackSpec = buildRouteSpec({
  summary: "Create or edit a Roll pack",
  description:
    "Owners only. Packs are never deleted, because purchases point at them: set `active: false` to " +
    "hide one. A new price applies to new payments only.",
  tags: TAGS,
  params: packIdParamsSchema,
  body: savePackRequestSchema,
  successResponse: { status: 200, description: "The saved pack.", dataRef: adminPackSchema },
  errors: [...ADMIN_ERRORS],
  extraResponses: { 403: OWNER_ONLY },
});

const publishLegalSpec = buildRouteSpec({
  summary: "Publish terms or privacy policy",
  description:
    "Owners only. Adds the next revision; published text is never edited. For terms, " +
    "`requiresReaccept: true` asks every user to accept again before their next roll. Leave it " +
    "out for a wording fix.",
  tags: TAGS,
  body: publishLegalRequestSchema,
  successResponse: { status: 201, description: "The new revision.", dataRef: legalDocumentSchema },
  errors: [...ADMIN_ERRORS],
  extraResponses: {
    403: OWNER_ONLY,
    409: errorResponse("Another publish took this revision a moment earlier — `publish_conflict`."),
  },
});

export const adminRoutePaths = {
  "/admin/me": { get: getMeSpec },
  "/admin/reports": { get: listReportsSpec },
  "/admin/reports/{reportId}": { get: getReportSpec },
  "/admin/reports/{reportId}/resolve": { post: resolveReportSpec },
  "/admin/settings": { get: getSettingsSpec, patch: updateSettingsSpec },
  "/admin/packs": { get: listPacksSpec },
  "/admin/packs/{packId}": { put: savePackSpec },
  "/admin/legal": { post: publishLegalSpec },
};

// ============================================================================
// ADMIN ROUTES
// ============================================================================

router.use(requireUser, requireRole("moderator"));

router.get("/me", adminController.getMe);
router.get("/reports", validateQuery(reportListQuerySchema), adminController.listReports);
router.get("/reports/:reportId", validateParams(reportIdParamsSchema), adminController.getReport);
router.post(
  "/reports/:reportId/resolve",
  validateParams(reportIdParamsSchema),
  validateBody(resolveReportRequestSchema),
  adminController.resolveReport,
);

// Owner only, on top of the moderator check above.
const owner = requireRole("owner");

router.get("/settings", owner, adminController.getSettings);
router.patch("/settings", owner, validateBody(updateSettingsRequestSchema), adminController.updateSettings);
router.get("/packs", owner, adminController.listPacks);
router.put(
  "/packs/:packId",
  owner,
  validateParams(packIdParamsSchema),
  validateBody(savePackRequestSchema),
  adminController.savePack,
);
router.post("/legal", owner, validateBody(publishLegalRequestSchema), adminController.publishLegal);

export default router;
