import { z } from "zod";

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
  Error: errorSchema,
};
