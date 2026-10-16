import { NextFunction, Request, Response } from "express";
import { ZodTypeAny } from "zod";

/**
 * On success the parsed (and coerced) value replaces the raw one, so controllers read what
 * the schema produced rather than whatever JSON arrived. On failure the ZodError goes to
 * errorHandler, the one place that decides what an error body looks like.
 */
function validate(schema: ZodTypeAny, source: "body" | "query" | "params") {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[source]);

    if (!result.success) {
      next(result.error);
      return;
    }

    (req as unknown as Record<string, unknown>)[source] = result.data;
    next();
  };
}

export const validateBody = (schema: ZodTypeAny) => validate(schema, "body");
export const validateQuery = (schema: ZodTypeAny) => validate(schema, "query");
export const validateParams = (schema: ZodTypeAny) => validate(schema, "params");
