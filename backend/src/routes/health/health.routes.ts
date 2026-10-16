import { Router } from "express";
import { z } from "zod";

import prisma from "../../config/database";
import { buildRouteSpec, registerLocalSchema } from "../../docs/defineRoute";

const router = Router();

// ============================================================================
// OPENAPI PATH SPECS
// ============================================================================

// Backend-only: no client consumes these, so they live here rather than in shared.
const healthOkSchema = registerLocalSchema(
  "HealthOk",
  z.object({ status: z.literal("ok"), database: z.literal("up") }),
);

const healthDownSchema = registerLocalSchema(
  "HealthDown",
  z.object({ status: z.literal("error"), database: z.literal("down") }),
);

const healthSpec = buildRouteSpec({
  summary: "Liveness + database check",
  description: "Runs `SELECT 1`, so a 200 means Postgres is reachable, not merely that the process is up.",
  tags: ["Health"],
  public: true,
  successResponse: { status: 200, description: "Process and database both up.", dataRef: healthOkSchema },
  errors: [],
  extraResponses: {
    503: {
      description: "The process is up but the database is not answering.",
      content: { "application/json": { schema: { $ref: "#/components/schemas/HealthDown" } } },
    },
  },
});

export const healthRoutePaths = {
  "/health": { get: healthSpec },
};

// ============================================================================
// HEALTH ROUTES
// ============================================================================

router.get("/", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json(healthOkSchema.parse({ status: "ok", database: "up" }));
  } catch {
    res.status(503).json(healthDownSchema.parse({ status: "error", database: "down" }));
  }
});

export default router;
