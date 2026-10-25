import type { LegalDocument, LegalDocuments, LegalDocumentType, PublishLegalRequest } from "@social-matching/shared";

import { Prisma } from "../../../generated/prisma/client";
import prisma from "../../config/database";
import logger from "../../config/logger";
import type { CurrentUser } from "../../types/express";
import { HttpError } from "../../utils/httpError";

/**
 * Terms and privacy policy, published as revisions that are never edited. Terms are accepted
 * per revision; the privacy policy is only shown.
 *
 * Every roll asks "must this user accept the terms first?", so the answer is cached:
 *   - the current terms, cleared when anything is published
 *   - each user's highest accepted revision, updated when they accept
 * One server instance only.
 */

const DOCUMENT_FIELDS = { id: true, type: true, revision: true, title: true, content: true, publishedAt: true } as const;

type DocumentRow = { id: string; type: LegalDocumentType; revision: number; title: string; content: string; publishedAt: Date };

function toDocument(row: DocumentRow): LegalDocument {
  return { ...row, publishedAt: row.publishedAt.toISOString() };
}

function latest(type: LegalDocumentType) {
  return prisma.legalDocument.findFirst({ where: { type }, orderBy: { revision: "desc" }, select: DOCUMENT_FIELDS });
}

// ============================================================================
// THE TERMS CHECK (cached)
// ============================================================================

interface TermsGate {
  latestId: string;
  /** Users must have accepted at least this revision: the newest one that asked everyone again. */
  requiredRevision: number;
}

let gate: Promise<TermsGate | null> | null = null;
const acceptedRevision = new Map<string, number>();

async function loadGate(): Promise<TermsGate | null> {
  const [current, lastReaccept] = await Promise.all([
    latest("terms"),
    prisma.legalDocument.findFirst({
      where: { type: "terms", requiresReaccept: true },
      orderBy: { revision: "desc" },
      select: { revision: true },
    }),
  ]);

  if (!current) return null;

  // Until a revision asks everyone again, accepting any revision (the first) is enough.
  return { latestId: current.id, requiredRevision: lastReaccept?.revision ?? 1 };
}

function termsGate(): Promise<TermsGate | null> {
  if (!gate) {
    const loading = loadGate();
    gate = loading;
    loading.catch(() => {
      if (gate === loading) gate = null;
    });
  }
  return gate;
}

async function acceptedRevisionOf(userId: string): Promise<number> {
  const cached = acceptedRevision.get(userId);
  if (cached !== undefined) return cached;

  const row = await prisma.legalAcceptance.findFirst({
    where: { userId, document: { type: "terms" } },
    orderBy: { document: { revision: "desc" } },
    select: { document: { select: { revision: true } } },
  });

  const revision = row?.document.revision ?? 0;
  acceptedRevision.set(userId, revision);
  return revision;
}

/** False while no terms are published: there is nothing to accept. */
export async function needsTermsAcceptance(userId: string): Promise<boolean> {
  const current = await termsGate();
  if (!current) return false;

  return (await acceptedRevisionOf(userId)) < current.requiredRevision;
}

// ============================================================================
// READ AND ACCEPT
// ============================================================================

export async function getCurrentDocuments(): Promise<LegalDocuments> {
  const [terms, privacy] = await Promise.all([latest("terms"), latest("privacy")]);
  return { terms: terms && toDocument(terms), privacy: privacy && toDocument(privacy) };
}

/**
 * Records consent to one exact revision. Only the current one: an older id means the page was
 * open while new terms went out, and the user has not read what they would be agreeing to.
 */
export async function acceptTerms(userId: string, documentId: string): Promise<void> {
  const document = await prisma.legalDocument.findUnique({ where: { id: documentId }, select: { type: true, revision: true } });

  if (!document || document.type !== "terms") {
    throw HttpError.notFound("document_not_found", "No terms with that id.");
  }

  const current = await termsGate();
  if (current?.latestId !== documentId) {
    throw HttpError.conflict("terms_version_mismatch", "The terms have been updated. Read the current version.");
  }

  // Accepting twice is not an error: the first acceptance stands.
  await prisma.legalAcceptance.createMany({ data: [{ userId, documentId }], skipDuplicates: true });

  acceptedRevision.set(userId, Math.max(acceptedRevision.get(userId) ?? 0, document.revision));
}

// ============================================================================
// PUBLISH (owner)
// ============================================================================

export async function publish(input: PublishLegalRequest, owner: CurrentUser): Promise<LegalDocument> {
  const previous = await latest(input.type);

  try {
    const row = await prisma.legalDocument.create({
      data: { ...input, revision: (previous?.revision ?? 0) + 1, publishedById: owner.id },
      select: DOCUMENT_FIELDS,
    });

    // Users' accepted revisions stay valid: revisions never change, only the current one does.
    gate = null;

    // Rare and far-reaching: this explains the day everyone was asked to accept again.
    logger.info("Legal document published", {
      type: row.type,
      revision: row.revision,
      requiresReaccept: input.requiresReaccept ?? false,
      by: owner.username,
      category: "admin",
    });

    return toDocument(row);
  } catch (err) {
    // Another publish of the same type took this revision number a moment earlier.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw HttpError.conflict("publish_conflict", "Someone published at the same moment. Reload and try again.");
    }
    throw err;
  }
}
