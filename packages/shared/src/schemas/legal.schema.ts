import { z } from "zod";

import { legalDocumentTypeSchema } from "../generated/prisma";

/** Sanity cap. A terms document is a few pages, not a book. */
const MAX_CONTENT_LENGTH = 200_000;

// ============================================================================
// RESPONSES
// ============================================================================

export const legalDocumentSchema = z
  .object({
    id: z.string().describe("What `POST /me/terms` accepts."),
    type: legalDocumentTypeSchema,
    revision: z.number().int().describe("1, then +1 per publish. The highest is current."),
    title: z.string(),
    content: z.string().describe("Markdown."),
    publishedAt: z.string().datetime(),
  })
  .describe("One published revision. Never edited.");
export type LegalDocument = z.infer<typeof legalDocumentSchema>;

export const legalDocumentsSchema = z
  .object({ terms: legalDocumentSchema.nullable(), privacy: legalDocumentSchema.nullable() })
  .describe("The current revision of each. Null until first published.");
export type LegalDocuments = z.infer<typeof legalDocumentsSchema>;

// ============================================================================
// REQUESTS
// ============================================================================

export const acceptTermsRequestSchema = z.object({
  documentId: z.string().uuid().describe("`terms.id` from GET /legal. An older revision is refused."),
});
export type AcceptTermsRequest = z.infer<typeof acceptTermsRequestSchema>;

export const publishLegalRequestSchema = z
  .object({
    type: legalDocumentTypeSchema,
    title: z.string().trim().min(1).max(200),
    content: z.string().trim().min(1).max(MAX_CONTENT_LENGTH),
    requiresReaccept: z
      .boolean()
      .optional()
      .describe("Terms only: true asks every user to accept again before their next roll."),
  })
  .refine((input) => !(input.requiresReaccept && input.type === "privacy"), {
    message: "Only terms can require accepting again",
    path: ["requiresReaccept"],
  });
export type PublishLegalRequest = z.infer<typeof publishLegalRequestSchema>;

// ============================================================================
// OPENAPI COMPONENTS
// ============================================================================

export const legalSchemaComponents = {
  LegalDocument: legalDocumentSchema,
  LegalDocuments: legalDocumentsSchema,
  AcceptTermsRequest: acceptTermsRequestSchema,
  PublishLegalRequest: publishLegalRequestSchema,
};
