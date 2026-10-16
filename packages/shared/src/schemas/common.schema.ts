import { z } from "zod";

import { COUNTRY_CODES } from "../constants/countries";

// ============================================================================
// SHARED FIELDS
// ============================================================================

/** Profiles now, match filters later. Exact uppercase codes from COUNTRIES; "eg" is refused. */
export const countryCodeSchema = z
  // Without the errorMap, Zod's message lists every code in COUNTRIES.
  .enum(COUNTRY_CODES, { errorMap: () => ({ message: "Not a supported country code" }) })
  .describe("ISO 3166-1 alpha-2, uppercase, from the shared COUNTRIES list.");

// ============================================================================
// ERROR ENVELOPE
// ============================================================================

/** Every failure leaves the API in this shape. */
export const errorSchema = z
  .object({
    error: z.string().describe("Stable machine-readable code, snake_case. Branch on this."),
    message: z.string().describe("Display text. May be reworded at any time; never branch on it."),
  })
  .describe("The one failure shape for every endpoint.");

export type ApiError = z.infer<typeof errorSchema>;

// ============================================================================
// OPENAPI COMPONENTS
// ============================================================================

export const commonSchemaComponents = {
  CountryCode: countryCodeSchema,
  Error: errorSchema,
};
