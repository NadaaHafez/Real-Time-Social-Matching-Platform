import type { CurrentChatResponse } from "@social-matching/shared";

import * as chatService from "../../services/chat/chat.service";
import { asyncHandler } from "../../utils/asyncHandler";

// requireUser runs before every route here, so `currentUser!` is safe.

export const getCurrent = asyncHandler<CurrentChatResponse>(async (req, res) => {
  res.status(200).json({ chat: await chatService.currentChat(req.currentUser!.id) });
});
