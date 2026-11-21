import type { ApiError as ApiErrorBody, AuthTokens } from "@social-matching/shared";

import { config } from "./config";

/** Every failure, with the backend's stable `code` to branch on and `message` to show. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

// ============================================================================
// TOKENS
// ============================================================================

// sessionStorage, not localStorage: it is per tab, so two tabs can be two test users,
// and a reload keeps you signed in.
const REFRESH_KEY = "refreshToken";

let accessToken: string | null = null;

export function getAccessToken(): string | null {
  return accessToken;
}

export function setTokens(tokens: AuthTokens | null): void {
  accessToken = tokens?.accessToken ?? null;

  if (tokens) sessionStorage.setItem(REFRESH_KEY, tokens.refreshToken);
  else sessionStorage.removeItem(REFRESH_KEY);
}

let refreshing: Promise<boolean> | null = null;

/**
 * Trades the stored refresh token for a new pair. One at a time: refresh tokens are single
 * use, and a second one sent in parallel looks like theft and signs the account out everywhere.
 */
export function refreshTokens(): Promise<boolean> {
  refreshing ??= (async () => {
    const refreshToken = sessionStorage.getItem(REFRESH_KEY);
    if (!refreshToken) return false;

    try {
      setTokens(await request<AuthTokens>("POST", "/auth/refresh", { refreshToken }, { auth: false }));
      return true;
    } catch {
      setTokens(null);
      return false;
    }
  })().finally(() => {
    refreshing = null;
  });

  return refreshing;
}

// ============================================================================
// REQUESTS
// ============================================================================

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  { auth = true, retried = false } = {},
): Promise<T> {
  let res: Response;

  try {
    res = await fetch(`${config.apiUrl}${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        ...(auth && accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "network_error", "Can't reach the server. Check your connection.");
  }

  // The access token lasts 15 minutes. Refresh once, then try again.
  if (res.status === 401 && auth && !retried && (await refreshTokens())) {
    return request<T>(method, path, body, { auth, retried: true });
  }

  if (!res.ok) {
    const error = (await res.json().catch(() => null)) as ApiErrorBody | null;
    throw new ApiError(res.status, error?.error ?? "unknown_error", error?.message ?? "Something went wrong.");
  }

  return (res.status === 204 ? undefined : await res.json()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  patch: <T>(path: string, body: unknown) => request<T>("PATCH", path, body),
  put: <T>(path: string, body: unknown) => request<T>("PUT", path, body),
  /** Sign-in routes: no bearer token, and no refresh on 401. */
  public: <T>(path: string, body: unknown) => request<T>("POST", path, body, { auth: false }),
};

/** A message to show for any thrown error. */
export function errorMessage(err: unknown): string {
  return err instanceof ApiError ? err.message : "Something went wrong.";
}
