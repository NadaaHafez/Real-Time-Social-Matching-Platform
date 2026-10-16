import { NextFunction, Request, Response } from "express";

import prisma from "../config/database";
import logger from "../config/logger";
import { blockedMessage, isServable } from "../services/auth/suspension.service";
import { verifyAccessToken } from "../services/auth/token.service";
import { HttpError } from "../utils/httpError";

const BEARER = "Bearer ";

/**
 * Gate for every route that acts on behalf of a user.
 *
 * The JWT proves who is calling; the database says whether they still may. Reading the
 * user on every request costs one indexed lookup, and buys what a bare JWT cannot: a ban
 * or a deleted account takes effect on the next request, not when the token expires.
 */
export async function requireUser(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;

  if (!header?.startsWith(BEARER)) {
    next(HttpError.unauthorized());
    return;
  }

  try {
    const claims = verifyAccessToken(header.slice(BEARER.length).trim());

    const user = await prisma.user.findUnique({
      where: { id: claims.sub },
      select: { id: true, piUserId: true, username: true, status: true, suspendedUntil: true },
    });

    if (!user) {
      // A valid token for a deleted account. Indistinguishable, to the client, from signed out.
      logger.warn("Token user missing", { path: req.originalUrl, userId: claims.sub });
      next(HttpError.unauthorized());
      return;
    }

    if (!(await isServable(user))) {
      logger.warn("Blocked account used the API", {
        userId: user.id,
        username: user.username,
        status: user.status,
        path: req.originalUrl,
        ip: req.ip,
        category: "security",
      });

      next(HttpError.forbidden(`account_${user.status}`, blockedMessage(user)));
      return;
    }

    req.currentUser = { id: user.id, piUserId: user.piUserId, username: user.username };
    next();
  } catch (err) {
    next(err);
  }
}
