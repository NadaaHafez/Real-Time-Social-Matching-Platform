import { Router } from "express";

import {
  adminMeSchema,
  reportDetailSchema,
  reportIdParamsSchema,
  reportListQuerySchema,
  reportsPageSchema,
  resolveReportRequestSchema,
} from "@social-matching/shared";

import * as adminController from "../../controllers/admin/admin.controller";
import { buildRouteSpec, errorResponse } from "../../docs/defineRoute";
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

export const adminRoutePaths = {
  "/admin/me": { get: getMeSpec },
  "/admin/reports": { get: listReportsSpec },
  "/admin/reports/{reportId}": { get: getReportSpec },
  "/admin/reports/{reportId}/resolve": { post: resolveReportSpec },
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

export default router;
