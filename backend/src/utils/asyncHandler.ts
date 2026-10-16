import { NextFunction, Request, RequestHandler, Response } from "express";

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
 */
export function asyncHandler<ResBody = unknown, ReqBody = unknown>(
  fn: (
    req: Request<Record<string, string>, ResBody, ReqBody>,
    res: Response<ResBody>,
    next: NextFunction,
  ) => Promise<unknown>,
): RequestHandler<Record<string, string>, ResBody, ReqBody> {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}
