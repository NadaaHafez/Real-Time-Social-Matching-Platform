import { NextFunction, Request, RequestHandler, Response } from "express";
import type { ParsedQs } from "qs";

/**
 * Express 4 does not catch a rejected promise from a handler, so without this every
 * controller needs its own try/catch around `next(err)`.
 *
 * The generics are the point: a controller declared as
 *
 *   asyncHandler<SignInResponse, SignInRequest>(async (req, res) => ...)
 *
 * gets `req.body` typed from the shared request schema and `res.json()` checked against the
 * shared response schema, so a handler cannot send a shape the contract doesn't describe.
 * `ReqQuery` does the same for `req.query`, after validateQuery has parsed it.
 */
export function asyncHandler<ResBody = unknown, ReqBody = unknown, ReqQuery = ParsedQs>(
  fn: (
    req: Request<Record<string, string>, ResBody, ReqBody, ReqQuery>,
    res: Response<ResBody>,
    next: NextFunction,
  ) => Promise<unknown>,
): RequestHandler<Record<string, string>, ResBody, ReqBody, ReqQuery> {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}
