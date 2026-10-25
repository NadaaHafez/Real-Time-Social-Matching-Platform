import { NextFunction, Request, Response } from "express";

import prisma from "../config/database";
import logger from "../config/logger";
import { blockedMessage, isServable } from "../services/auth/suspension.service";
import { verifyAccessToken } from "../services/auth/token.service";
import type { CurrentUser } from "../types/express";
import { HttpError } from "../utils/httpError";

const BEARER = "Bearer ";

/**
 * Access token → the user it belongs to, if they may still act. Shared by requireUser and the
 * socket handshake, so HTTP and sockets refuse exactly the same accounts.
 *
 * The JWT proves who is calling; the database says whether they still may. One indexed read
 * buys what a bare JWT cannot: a ban or a deleted account takes effect immediately.
 */
export async function authenticate(token: string, context: { path: string; ip?: string }): Promise<CurrentUser> {
  const claims = verifyAccessToken(token);

  const user = await prisma.user.findUnique({
    where: { id: claims.sub },
    select: { id: true, piUserId: true, username: true, status: true, suspendedUntil: true },
  });

  if (!user) {
    // A valid token for a deleted account. Indistinguishable, to the client, from signed out.
    logger.warn("Token user missing", { path: context.path, userId: claims.sub });
    throw HttpError.unauthorized();
  }

  if (!(await isServable(user))) {
    logger.warn("Blocked account used the API", {
      userId: user.id,
      username: user.username,
      status: user.status,
      path: context.path,
      ip: context.ip,
      category: "security",
    });

    throw HttpError.forbidden(`account_${user.status}`, blockedMessage(user));
  }

  return { id: user.id, piUserId: user.piUserId, username: user.username };
}

/** Gate for every route that acts on behalf of a user. */
export async function requireUser(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;

  if (!header?.startsWith(BEARER)) {
    next(HttpError.unauthorized());
    return;
  }

  try {
    req.currentUser = await authenticate(header.slice(BEARER.length).trim(), { path: req.originalUrl, ip: req.ip });
    next();
  } catch (err) {
    next(err);
  }
}
