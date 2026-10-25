import { Router } from "express";

import { legalDocumentsSchema } from "@social-matching/shared";

import * as legalController from "../../controllers/legal/legal.controller";
import { buildRouteSpec } from "../../docs/defineRoute";

const router = Router();

// ============================================================================
// OPENAPI PATH SPECS
// ============================================================================

const getDocumentsSpec = buildRouteSpec({
  summary: "The terms of use and privacy policy",
  description:
    "The current revision of each, as Markdown. Public, so they can be read before signing in. " +
    "Accept `terms.id` with `POST /me/terms`; the privacy policy is only shown.",
  tags: ["Legal"],
  public: true,
  successResponse: { status: 200, description: "The current documents.", dataRef: legalDocumentsSchema },
  errors: ["rateLimited", "internal"],
});

export const legalRoutePaths = {
  "/legal": { get: getDocumentsSpec },
};

// ============================================================================
// LEGAL ROUTES
// ============================================================================

router.get("/", legalController.getDocuments);

export default router;
