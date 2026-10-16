import { NextFunction, Request, Response } from "express";
import logger from "../config/logger";

/** Machine traffic: health checks and the static docs. */
const SKIP = ["/health", "/api-docs", "/docs"];

const skip = (path: string) =>
  SKIP.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));

/** One line per request, in the same shape as every other log. */
export function requestLogger(req: Request, res: Response, next: NextFunction) {
  if (skip(req.path)) return next();

  const startedAt = Date.now();

  // On `finish`: status, duration and who it turned out to be are only known by then.
  res.on("finish", () => {
    logger.info("Request", {
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      ms: Date.now() - startedAt,
      user: req.currentUser?.username ?? null,
      ip: req.ip,
    });
  });

  next();
}
