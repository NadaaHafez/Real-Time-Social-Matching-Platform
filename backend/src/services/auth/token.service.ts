import type { AuthTokens } from "@chat-roulette/shared";
import { createHash, randomBytes } from "crypto";
import jwt from "jsonwebtoken";

import type { TransactionClient } from "../../config/database";
import env from "../../config/env";
import { HttpError } from "../../utils/httpError";

/**
 * Two tokens, two jobs.
 *
 *  - Access token: a short-lived JWT, verified with no database round trip. It only proves
 *    identity; requireUser still checks the account's status on every request.
 *  - Refresh token: an opaque random string, stored only as a hash. It is what makes a
 *    session revocable — sign-out and theft detection both work by revoking the row.
 *
 * Bearer tokens rather than cookies: the Pi Browser frames the app, which makes any cookie
 * third-party, and WebKit (every iOS browser) refuses those outright.
 */

const ISSUER = "chat-roulette-api";
const AUDIENCE = "chat-roulette-app";
const ALGORITHM = "HS256";

export interface AccessTokenClaims {
  sub: string;
  username: string;
}

export function signAccessToken(user: { id: string; username: string }): string {
  return jwt.sign({ username: user.username }, env.jwtAccessSecret, {
    subject: user.id,
    issuer: ISSUER,
    audience: AUDIENCE,
    algorithm: ALGORITHM,
    expiresIn: env.accessTokenTtlSeconds,
  });
}

/** Throws a 401 the client can act on: `token_expired` means refresh, anything else means sign in. */
export function verifyAccessToken(token: string): AccessTokenClaims {
  try {
    // `algorithms` is pinned so a token can't pick its own (the classic `alg: none` attack).
    const payload = jwt.verify(token, env.jwtAccessSecret, {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: [ALGORITHM],
    });

    if (typeof payload === "string" || !payload.sub || typeof payload.username !== "string") {
      throw new Error("Malformed token payload");
    }

    return { sub: payload.sub, username: payload.username };
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw HttpError.unauthorized("token_expired", "Your session expired. Refresh the token.");
    }

    throw HttpError.unauthorized("invalid_token", "Invalid access token. Sign in again.");
  }
}

/** SHA-256 is enough here: the input is 256 random bits, so there is nothing to brute-force. */
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/**
 * Creates a refresh-token row and signs a matching access token.
 *
 * Takes a transaction client so rotation can revoke the old row and insert the new one
 * atomically.
 */
export async function issueTokens(
  client: TransactionClient,
  user: { id: string; username: string },
): Promise<{ tokens: AuthTokens; refreshTokenId: string }> {
  const refreshToken = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + env.refreshTokenTtlDays * 24 * 60 * 60 * 1000);

  const row = await client.refreshToken.create({
    data: { userId: user.id, tokenHash: hashToken(refreshToken), expiresAt },
    select: { id: true },
  });

  return {
    refreshTokenId: row.id,
    tokens: {
      accessToken: signAccessToken(user),
      accessTokenExpiresIn: env.accessTokenTtlSeconds,
      refreshToken,
    },
  };
}

/** Signs a user out everywhere. */
export async function revokeAllTokens(client: TransactionClient, userId: string): Promise<number> {
  const { count } = await client.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  return count;
}
