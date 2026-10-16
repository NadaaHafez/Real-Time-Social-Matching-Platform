import axios from "axios";
import { z } from "zod";

import logger from "../../config/logger";
import piPlatform from "../../config/pi";
import { HttpError } from "../../utils/httpError";

/** What we rely on from Pi's `GET /v2/me`. Parsed, not cast: it is data from outside. */
const piMeSchema = z.object({ uid: z.string().min(1), username: z.string().min(1) });

export type VerifiedPiUser = z.infer<typeof piMeSchema>;

/**
 * Asks Pi who an access token belongs to.
 *
 * Note the header override: the shared client sends `Authorization: Key <API key>`, which
 * authenticates THIS APP. `/v2/me` needs the USER's bearer token instead. Getting this
 * wrong produces a 401 that looks like a bad API key.
 */
export async function verifyUser(accessToken: string): Promise<VerifiedPiUser> {
  let data: unknown;

  try {
    ({ data } = await piPlatform.get("/v2/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    }));
  } catch (err) {
    throw toHttpError(err);
  }

  // safeParse, not parse: a ZodError would reach errorHandler as a 400 blaming the client.
  const parsed = piMeSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(`Pi /v2/me returned an unexpected body: ${parsed.error.message}`);
  }

  return parsed.data;
}

/**
 * Only a 401 from Pi means the token is bad. No response at all (timeout, DNS, connection
 * refused), a 5xx or a 429 means Pi is struggling, and telling the user their sign-in is
 * invalid would send them retrying the wrong thing. Anything else (wrong base URL, an API
 * change) is our problem and goes through untouched, to be logged in full as a 500.
 */
function toHttpError(err: unknown): unknown {
  if (!axios.isAxiosError(err)) return err;

  const status = err.response?.status;

  if (status === 401) {
    return HttpError.unauthorized("invalid_pi_token", "Your Pi sign-in could not be verified.");
  }

  if (status === undefined || status === 429 || status >= 500) {
    // errorHandler only sees the 503; the upstream cause is only known here.
    logger.error("Pi Platform API unavailable", { status: status ?? null, code: err.code ?? null });
    return HttpError.serviceUnavailable("pi_unavailable", "Pi is not responding right now. Please try again shortly.");
  }

  return err;
}
