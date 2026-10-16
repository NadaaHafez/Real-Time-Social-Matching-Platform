import { rateLimit } from "express-rate-limit";

import logger from "../config/logger";
import { HttpError } from "../utils/httpError";

/**
 * IP rate limiting.
 *
 * The point is `POST /auth/signin`: it is public by necessity and calls Pi's Platform API
 * with our key on every request. Left open, anyone could make this backend hammer Pi until
 * Pi throttles the key, and then nobody can sign in.
 *
 * In-memory store: counts are per process and reset on restart. Correct for one instance.
 */

/** Generous. Only abuse should reach it. */
const GLOBAL = { windowMs: 15 * 60 * 1000, limit: 600 };

/** Tight, because each sign-in attempt costs one Pi Platform call. */
const AUTH = { windowMs: 15 * 60 * 1000, limit: 20 };

/** Health checks and the static docs bundle would spend the quota by themselves. */
const SKIPPED_PREFIXES = ["/health", "/api-docs", "/docs"];

const isSkipped = (path: string) =>
  SKIPPED_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));

// Rejections go through next() so errorHandler writes the `{ error, message }` body,
// instead of express-rate-limit's plain text.
export const globalLimiter = rateLimit({
  ...GLOBAL,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => isSkipped(req.path),
  handler: (req, _res, next) => {
    logger.warn("Rate limit exceeded", { limiter: "global", ip: req.ip, path: req.originalUrl });
    next(HttpError.tooManyRequests());
  },
});

export const authLimiter = rateLimit({
  ...AUTH,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, _res, next) => {
    logger.warn("Rate limit exceeded", { limiter: "auth", ip: req.ip, path: req.originalUrl });
    next(
      HttpError.tooManyRequests(
        "too_many_auth_attempts",
        "Too many sign-in attempts. Please wait a few minutes and try again.",
      ),
    );
  },
});
