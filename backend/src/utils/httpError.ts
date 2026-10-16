/**
 * An error carrying the HTTP status and machine-readable code the client should see.
 * errorHandler turns it into `{ error, message }`, so the codes are part of the contract.
 */
export class HttpError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
  }

  static badRequest(code: string, message: string) {
    return new HttpError(400, code, message);
  }

  static unauthorized(code = "unauthorized", message = "You need to sign in first.") {
    return new HttpError(401, code, message);
  }

  static forbidden(code = "forbidden", message = "You do not have access to this.") {
    return new HttpError(403, code, message);
  }

  static notFound(code = "not_found", message = "Not found.") {
    return new HttpError(404, code, message);
  }

  static conflict(code: string, message: string) {
    return new HttpError(409, code, message);
  }

  static tooManyRequests(code = "rate_limited", message = "Too many requests. Please try again later.") {
    return new HttpError(429, code, message);
  }

  static serviceUnavailable(code: string, message: string) {
    return new HttpError(503, code, message);
  }
}
