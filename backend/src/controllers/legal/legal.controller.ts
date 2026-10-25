import type { LegalDocuments } from "@social-matching/shared";

import * as legalService from "../../services/legal/legal.service";
import { asyncHandler } from "../../utils/asyncHandler";

export const getDocuments = asyncHandler<LegalDocuments>(async (_req, res) => {
  res.status(200).json(await legalService.getCurrentDocuments());
});
