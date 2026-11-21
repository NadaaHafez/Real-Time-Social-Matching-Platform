import { zodResolver } from "@hookform/resolvers/zod";
import type { ZodSchema, ZodErrorMap } from "zod";

/** Zod's defaults are written for developers; these read better on a form. */
const friendlyErrors: ZodErrorMap = (issue, ctx) => {
  if (issue.code === "invalid_enum_value") return { message: "Choose one" };
  if (issue.code === "invalid_type" && ["undefined", "null", "nan"].includes(issue.received)) {
    return { message: "Required" };
  }
  return { message: ctx.defaultError };
};

/**
 * A react-hook-form resolver from a shared schema: the form checks exactly what the backend
 * will. Messages written in the schema win over the friendly defaults.
 */
export function sharedResolver<T extends ZodSchema>(schema: T) {
  return zodResolver(schema, { errorMap: friendlyErrors, path: [], async: false });
}
