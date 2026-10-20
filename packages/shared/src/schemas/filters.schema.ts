import { z } from "zod";

import { countryModeSchema, genderSchema } from "../generated/prisma";
import { countryCodeSchema } from "./common.schema";
import { rollsBalanceSchema } from "./rolls.schema";

/** Sanity cap only. The real limit is free + bought slots, checked in the service. */
const MAX_LIST_LENGTH = 250;

const countryListSchema = z
  .array(countryCodeSchema)
  .max(MAX_LIST_LENGTH)
  .refine((codes) => new Set(codes).size === codes.length, { message: "A country can only be listed once" });

// ============================================================================
// FILTERS (response and, with one extra rule, request)
// ============================================================================

export const matchFiltersSchema = z
  .object({
    age: z.object({
      enabled: z.boolean(),
      min: z.number().int().min(13).max(120).describe("At least Settings.minimumAge."),
      max: z.number().int().min(13).max(120),
    }),
    gender: z.object({
      enabled: z.boolean(),
      value: genderSchema.nullable().describe("On with no gender picked counts as off."),
    }),
    country: z.object({
      enabled: z.boolean().describe("On with an empty active list counts as off."),
      mode: countryModeSchema.describe("Which list applies. Both are kept."),
      include: countryListSchema,
      exclude: countryListSchema,
    }),
  })
  .describe("Matching is mutual: a pair forms only when each side fits the other's filters.");
export type MatchFilters = z.infer<typeof matchFiltersSchema>;

export const updateFiltersRequestSchema = matchFiltersSchema
  .refine((filters) => filters.age.min <= filters.age.max, {
    message: "age.min must not be greater than age.max",
    path: ["age", "min"],
  })
  .describe("A full replacement: every field is required.");
export type UpdateFiltersRequest = z.infer<typeof updateFiltersRequestSchema>;

// ============================================================================
// SLOTS
// ============================================================================

export const slotAllowanceSchema = z
  .object({
    free: z.number().int(),
    bought: z.number().int().describe("Kept forever, whatever the settings say later."),
    canBuy: z.number().int().describe("How many more can be bought. 0 hides the option."),
    price: z.number().int().describe("Rolls for one more slot."),
  })
  .describe("A country list may hold free + bought countries.");
export type SlotAllowance = z.infer<typeof slotAllowanceSchema>;

export const buySlotRequestSchema = z.object({
  mode: countryModeSchema,
  slot: z.number().int().min(1).describe("The slot being bought: current `bought + 1`. Repeating it charges nothing."),
  price: z.number().int().min(1).describe("The price shown. Refused if it has changed since."),
});
export type BuySlotRequest = z.infer<typeof buySlotRequestSchema>;

// ============================================================================
// RESPONSES
// ============================================================================

export const filterStateSchema = z
  .object({
    filters: matchFiltersSchema,
    slots: z.object({ include: slotAllowanceSchema, exclude: slotAllowanceSchema }),
    rollCost: z.number().int().describe("What the next roll costs: the base plus every filter actually on."),
  })
  .describe("Everything the Filters page shows.");
export type FilterState = z.infer<typeof filterStateSchema>;

export const buySlotResponseSchema = z
  .object({ state: filterStateSchema, balance: rollsBalanceSchema })
  .describe("The Filters page and balance after buying, so neither needs re-fetching.");
export type BuySlotResponse = z.infer<typeof buySlotResponseSchema>;

// ============================================================================
// OPENAPI COMPONENTS
// ============================================================================

export const filtersSchemaComponents = {
  MatchFilters: matchFiltersSchema,
  UpdateFiltersRequest: updateFiltersRequestSchema,
  SlotAllowance: slotAllowanceSchema,
  BuySlotRequest: buySlotRequestSchema,
  FilterState: filterStateSchema,
  BuySlotResponse: buySlotResponseSchema,
};
