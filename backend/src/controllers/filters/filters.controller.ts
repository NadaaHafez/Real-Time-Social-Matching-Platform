import type {
  BuySlotRequest,
  BuySlotResponse,
  FilterState,
  UpdateFiltersRequest,
} from "@social-matching/shared";

import * as filtersService from "../../services/filters/filters.service";
import { asyncHandler } from "../../utils/asyncHandler";

// requireUser runs before every route here, so `currentUser!` is safe.

export const getFilters = asyncHandler<FilterState>(async (req, res) => {
  res.status(200).json(await filtersService.getFilterState(req.currentUser!.id));
});

export const updateFilters = asyncHandler<FilterState, UpdateFiltersRequest>(async (req, res) => {
  res.status(200).json(await filtersService.updateFilters(req.currentUser!.id, req.body));
});

export const buySlot = asyncHandler<BuySlotResponse, BuySlotRequest>(async (req, res) => {
  res.status(200).json(await filtersService.buySlot(req.currentUser!.id, req.body));
});
