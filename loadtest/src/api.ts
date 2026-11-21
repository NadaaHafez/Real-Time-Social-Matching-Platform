import { record } from "./stats";

/** A non-2xx response. `code` is the backend's `error` field, or `http_<status>`. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(`${status} ${code}`);
  }
}

/** One HTTP call, timed as e.g. "http POST /matchmaking/roll". */
export async function request<T>(
  baseUrl: string,
  method: string,
  path: string,
  options: { token?: string; body?: unknown } = {},
): Promise<T> {
  const started = performance.now();
  let res: Response;
  try {
    res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        ...(options.body !== undefined && { "Content-Type": "application/json" }),
        ...(options.token && { Authorization: `Bearer ${options.token}` }),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new ApiError(0, "network_error");
  }
  record(`http ${method} ${path.split("?")[0]}`, performance.now() - started);

  const text = await res.text();
  const data = text ? JSON.parse(text) : undefined;
  if (!res.ok) throw new ApiError(res.status, data?.error ?? `http_${res.status}`);
  return data as T;
}
