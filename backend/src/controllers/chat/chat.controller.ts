import type { CurrentChatResponse, ReportRequest } from "@social-matching/shared";

import * as chatService from "../../services/chat/chat.service";
import * as reportService from "../../services/moderation/report.service";
import { asyncHandler } from "../../utils/asyncHandler";

// requireUser runs before every route here, so `currentUser!` is safe.

export const getCurrent = asyncHandler<CurrentChatResponse>(async (req, res) => {
  res.status(200).json({ chat: await chatService.currentChat(req.currentUser!.id) });
});

export const report = asyncHandler<void, ReportRequest>(async (req, res) => {
  await reportService.createReport(req.currentUser!.id, req.body);
  res.status(204).send();
});
