import type { PiAuthResult } from "@social-matching/shared";

import { config } from "./config";

/** The parts of the Pi SDK (window.Pi, from sdk.minepi.com) this app uses. */
export interface PiPaymentDTO {
  identifier: string;
}

interface PaymentCallbacks {
  onReadyForServerApproval(paymentId: string): void;
  onReadyForServerCompletion(paymentId: string, txid: string): void;
  onCancel(paymentId: string): void;
  onError(error: Error, payment?: PiPaymentDTO): void;
}

interface PiSdk {
  init(options: { version: string; sandbox?: boolean }): void;
  authenticate(
    scopes: string[],
    onIncompletePaymentFound: (payment: PiPaymentDTO) => void,
  ): Promise<PiAuthResult>;
  createPayment(data: { amount: number; memo: string; metadata: Record<string, unknown> }, callbacks: PaymentCallbacks): void;
}

declare global {
  interface Window {
    Pi?: PiSdk;
  }
}

/** Outside the Pi Browser or sandbox, authenticate() never answers, so give up eventually. */
const AUTH_TIMEOUT_MS = 30_000;

let initialized = false;

function sdk(): PiSdk {
  if (!window.Pi) throw new Error("The Pi SDK did not load.");

  if (!initialized) {
    window.Pi.init({ version: "2.0", sandbox: config.piSandbox });
    initialized = true;
  }

  return window.Pi;
}

/**
 * Asks Pi who the user is. The result is only a claim: the backend checks the access token
 * with Pi before trusting it.
 *
 * Pi reports payments left unfinished in an earlier session through `onIncompletePayment`,
 * and refuses new payments until they are settled.
 */
export async function authenticateWithPi(onIncompletePayment: (paymentId: string) => void): Promise<PiAuthResult> {
  const result = sdk().authenticate(["username", "payments"], (payment) => onIncompletePayment(payment.identifier));

  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("No answer from Pi. Open this app in the Pi Browser or the Pi sandbox.")), AUTH_TIMEOUT_MS),
  );

  return Promise.race([result, timeout]);
}

/** What our backend does at each step. The amount and owner are checked there, not here. */
export interface PaymentSteps<Receipt> {
  approve(paymentId: string): Promise<unknown>;
  complete(paymentId: string): Promise<Receipt>;
  cancel(paymentId: string): Promise<unknown>;
}

/**
 * Pi's payment flow as one awaitable call: Pi asks us to approve, the user signs in their
 * wallet, then Pi asks us to complete. Resolves with the receipt, or null if the user backed out.
 */
export function payWithPi<Receipt>(
  payment: { amount: number; memo: string; metadata: Record<string, unknown> },
  steps: PaymentSteps<Receipt>,
): Promise<Receipt | null> {
  return new Promise((resolve, reject) => {
    sdk().createPayment(payment, {
      onReadyForServerApproval: (paymentId) => {
        steps.approve(paymentId).catch(reject);
      },
      onReadyForServerCompletion: (paymentId) => {
        // The backend reads the txid from Pi itself, so it is not passed on.
        steps.complete(paymentId).then(resolve, reject);
      },
      onCancel: (paymentId) => {
        void steps.cancel(paymentId).catch(() => undefined);
        resolve(null);
      },
      onError: (error) => reject(error),
    });
  });
}
