import axios from "axios";
import { z } from "zod";

import logger from "../../config/logger";
import piPlatform from "../../config/pi";
import { HttpError } from "../../utils/httpError";

// ============================================================================
// PI RESPONSE SHAPES (parsed, not cast: this is data from outside)
// ============================================================================

const piMeSchema = z.object({ uid: z.string().min(1), username: z.string().min(1) });
export type VerifiedPiUser = z.infer<typeof piMeSchema>;

/** The fields of Pi's PaymentDTO we read. Pi sends more; they are ignored. */
const piPaymentSchema = z.object({
  identifier: z.string(),
  user_uid: z.string(),
  amount: z.number(),
  metadata: z.record(z.unknown()).nullish(),
  status: z.object({
    developer_approved: z.boolean(),
    developer_completed: z.boolean(),
    cancelled: z.boolean(),
    user_cancelled: z.boolean(),
  }),
  /** Null until the user signs in their wallet. */
  transaction: z.object({ txid: z.string() }).nullable(),
});
export type PiPayment = z.infer<typeof piPaymentSchema>;

// ============================================================================
// ERRORS
// ============================================================================

/**
 * `known` maps the statuses that mean something for this call. Otherwise: no response, a 429
 * or a 5xx means Pi is struggling (503, retry later), and anything else is our bug (500).
 */
function toHttpError(err: unknown, known: Partial<Record<number, () => HttpError>> = {}): unknown {
  if (!axios.isAxiosError(err)) return err;

  const status = err.response?.status;
  const mapped = status !== undefined ? known[status] : undefined;
  if (mapped) return mapped();

  if (status === undefined || status === 429 || status >= 500) {
    logger.error("Pi Platform API unavailable", { status: status ?? null, code: err.code ?? null });
    return HttpError.serviceUnavailable("pi_unavailable", "Pi is not responding right now. Please try again shortly.");
  }

  return err;
}

function parse<T>(schema: z.ZodType<T>, data: unknown, what: string): T {
  // safeParse: a ZodError would reach errorHandler as a 400 blaming the client.
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new Error(`Pi ${what} returned an unexpected body: ${parsed.error.message}`);
  return parsed.data;
}

// ============================================================================
// USER
// ============================================================================

/**
 * Asks Pi who an access token belongs to. `/v2/me` needs the USER's bearer token, so this
 * overrides the client's default `Key <API key>` header.
 */
export async function verifyUser(accessToken: string): Promise<VerifiedPiUser> {
  try {
    const { data } = await piPlatform.get("/v2/me", { headers: { Authorization: `Bearer ${accessToken}` } });
    return parse(piMeSchema, data, "/v2/me");
  } catch (err) {
    throw toHttpError(err, {
      401: () => HttpError.unauthorized("invalid_pi_token", "Your Pi sign-in could not be verified."),
    });
  }
}

// ============================================================================
// PAYMENTS (authenticated as the app, with the API key)
// ============================================================================

const paymentNotFound = () => HttpError.notFound("payment_not_found", "Pi has no payment with that id.");
const paymentPath = (paymentId: string) => `/v2/payments/${encodeURIComponent(paymentId)}`;

export async function getPayment(paymentId: string): Promise<PiPayment> {
  try {
    const { data } = await piPlatform.get(paymentPath(paymentId));
    return parse(piPaymentSchema, data, "GET /v2/payments");
  } catch (err) {
    throw toHttpError(err, { 404: paymentNotFound });
  }
}

export async function approvePayment(paymentId: string): Promise<void> {
  try {
    await piPlatform.post(`${paymentPath(paymentId)}/approve`);
  } catch (err) {
    throw toHttpError(err, { 404: paymentNotFound });
  }
}

export async function completePayment(paymentId: string, txid: string): Promise<void> {
  try {
    await piPlatform.post(`${paymentPath(paymentId)}/complete`, { txid });
  } catch (err) {
    throw toHttpError(err, { 404: paymentNotFound });
  }
}

/** Frees the user from a payment that was approved but never signed. */
export async function cancelPayment(paymentId: string): Promise<void> {
  try {
    await piPlatform.post(`${paymentPath(paymentId)}/cancel`);
  } catch (err) {
    throw toHttpError(err, { 404: paymentNotFound });
  }
}
