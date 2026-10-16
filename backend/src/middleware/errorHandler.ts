import type { ApiError } from "@social-matching/shared";
import { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

import logger from "../config/logger";
import { HttpError } from "../utils/httpError";

/**
 * Every error leaves the API as `{ error, message }` — the shared `errorSchema`.
 *
 * The request body is deliberately never logged: sign-in carries a Pi access token and
 * refresh/sign-out carry refresh tokens.
 */
function context(req: Request) {
  return {
    method: req.method,
    path: req.originalUrl,
    user: req.currentUser?.username ?? null,
    ip: req.ip,
  };
}

export function errorHandler(err: unknown, req: Request, res: Response<ApiError>, _next: NextFunction) {
  if (err instanceof HttpError) {
    // Expected by the API, but still the whole story when someone reports "it doesn't work".
    logger.warn("Request rejected", { ...context(req), status: err.status, error: err.code });
    res.status(err.status).json({ error: err.code, message: err.message });
    return;
  }

  if (err instanceof ZodError) {
    const first = err.errors[0];
    const detail = first ? `${first.path.join(".")}: ${first.message}` : "Invalid request.";

    logger.warn("Validation failed", { ...context(req), status: 400, detail });
    res.status(400).json({ error: "validation_failed", message: detail });
    return;
  }

  // Anything else is a bug. Log it in full; tell the client nothing about internals.
  logger.error("Unhandled error", { ...context(req), err: err instanceof Error ? err.stack : String(err) });
  res.status(500).json({ error: "internal_error", message: "Something went wrong on the server." });
}

export function notFoundHandler(req: Request, res: Response<ApiError>) {
  logger.warn("No such route", context(req));
  res.status(404).json({ error: "not_found", message: "Not found." });
}
