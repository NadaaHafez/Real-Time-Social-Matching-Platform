import { zodResolver } from "@hookform/resolvers/zod";
import type { ZodErrorMap, ZodSchema } from "zod";

/**
 * Zod's defaults are written for developers; these read better on a form. Only issues the
 * schema gave no message of its own reach this: a message written in the schema always wins.
 */
const friendlyErrors: ZodErrorMap = (issue, ctx) => {
  switch (issue.code) {
    case "invalid_enum_value":
      return { message: "Choose one" };
    case "invalid_type":
      if (issue.received === "nan") return { message: "Enter a number" };
      if (issue.received === "undefined" || issue.received === "null") return { message: "Required" };
      break;
    case "too_small":
      if (issue.type === "string" && issue.minimum === 1) return { message: "Required" };
      if (issue.type === "number") return { message: `Must be at least ${issue.minimum}` };
      if (issue.type === "array") return { message: `Add at least ${issue.minimum}` };
      break;
    case "too_big":
      if (issue.type === "number") return { message: `Must be at most ${issue.maximum}` };
      if (issue.type === "string") return { message: `Keep it under ${issue.maximum} characters` };
      if (issue.type === "array") return { message: `At most ${issue.maximum}` };
      break;
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

/**
 * The message for a list field: its own, or the first item's, as "Day 3: Enter a number".
 * react-hook-form files an item's error under its index, not on the list.
 */
export function listError(error: unknown, itemLabel: string): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  if ("message" in error && typeof error.message === "string") return error.message;

  const items = Object.entries(error).filter(([key]) => /^\d+$/.test(key));
  for (const [index, item] of items) {
    if (item && typeof item === "object" && "message" in item) return `${itemLabel} ${Number(index) + 1}: ${item.message}`;
  }
  return undefined;
}
