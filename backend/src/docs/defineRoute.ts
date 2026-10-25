import { allSchemaComponents } from "@social-matching/shared";
import { z } from "zod";

import { zodToOpenApiSchema } from "./zodToOpenApi";

/**
 * Builds one OpenAPI operation from the same Zod schemas the route validates with.
 *
 *  - The success response is the bare object (or 204), with no `{ success, data }` envelope.
 *  - `public: true` clears the bearer requirement for sign-in, refresh and health.
 */

const ERROR_REFS = {
  validation: { $ref: "#/components/responses/ValidationError" },
  unauthorized: { $ref: "#/components/responses/UnauthorizedError" },
  forbidden: { $ref: "#/components/responses/ForbiddenError" },
  notFound: { $ref: "#/components/responses/NotFoundError" },
  conflict: { $ref: "#/components/responses/ConflictError" },
  rateLimited: { $ref: "#/components/responses/RateLimitedError" },
  internal: { $ref: "#/components/responses/InternalError" },
} as const;

type ErrorKey = keyof typeof ERROR_REFS;

const ERROR_STATUS: Record<ErrorKey, number> = {
  validation: 400,
  unauthorized: 401,
  forbidden: 403,
  notFound: 404,
  conflict: 409,
  rateLimited: 429,
  internal: 500,
};

/** Every route behind requireUser can fail these ways, so new routes document them for free. */
const DEFAULT_ERRORS: ErrorKey[] = ["unauthorized", "forbidden", "rateLimited", "internal"];

// ============================================================================
// LOCAL SCHEMA REGISTRY
// ============================================================================

/**
 * Schemas that are not in the shared package: backend-only shapes with no client consumer.
 * Register one only when something refers to it by name (`body`, `dataRef`, `arrayOf`).
 */
const localSchemaRegistry: Record<string, z.ZodTypeAny> = {};

export function registerLocalSchema<T extends z.ZodTypeAny>(name: string, schema: T): T {
  localSchemaRegistry[name] = schema;
  return schema;
}

export function getSchemaRegistry(): Record<string, z.ZodTypeAny> {
  return { ...allSchemaComponents, ...localSchemaRegistry };
}

/** Reverse lookup from a schema to its component name. Throws at startup on a miss. */
function resolveSchemaName(schemaOrName: string | z.ZodTypeAny): string {
  if (typeof schemaOrName === "string") return schemaOrName;

  const entry = Object.entries(getSchemaRegistry()).find(([, s]) => s === schemaOrName);

  if (!entry) {
    throw new Error(
      "Schema is not registered. Add it to its feature's xxxSchemaComponents in the shared " +
        "package, or registerLocalSchema(name, schema) if it is backend-only.",
    );
  }

  return entry[0];
}

const refTo = (schemaOrName: string | z.ZodTypeAny) => ({
  $ref: `#/components/schemas/${resolveSchemaName(schemaOrName)}`,
});

export function arrayOf(item: string | z.ZodTypeAny) {
  return { type: "array", items: refTo(item) };
}

/** An error body with its own wording — `{ error, message }`, as always. */
export function errorResponse(description: string) {
  return {
    description,
    content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
  };
}

// ============================================================================
// ROUTE SPEC
// ============================================================================

export interface RouteSpecConfig {
  summary: string;
  description?: string;
  tags: string[];
  public?: boolean;
  params?: z.AnyZodObject;
  query?: z.AnyZodObject;
  body?: string | z.ZodTypeAny;
  successResponse: {
    status: 200 | 201 | 202 | 204;
    description: string;
    /** A registered schema (or its name), returned as the whole body. */
    dataRef?: string | z.ZodTypeAny;
    /** A composed shape instead, e.g. `arrayOf(x)`. */
    dataSchema?: Record<string, unknown>;
  };
  errors?: ErrorKey[];
  /** Status codes that need their own wording. Applied last, so they override `errors`. */
  extraResponses?: Record<number, unknown>;
}

function toParameters(source: z.AnyZodObject | undefined, location: "path" | "query") {
  if (!source) return [];

  return Object.entries(source.shape as Record<string, z.ZodTypeAny>).map(([name, schema]) => ({
    in: location,
    name,
    required: location === "path" || !schema.isOptional(),
    ...(schema.description ? { description: schema.description } : {}),
    schema: zodToOpenApiSchema(schema),
  }));
}

export function buildRouteSpec(config: RouteSpecConfig) {
  const {
    summary,
    description,
    tags,
    public: isPublic = false,
    params,
    query,
    body,
    successResponse,
    errors = DEFAULT_ERRORS,
    extraResponses = {},
  } = config;

  if (successResponse.dataRef && successResponse.dataSchema) {
    throw new Error(`"${summary}": pass either dataRef or dataSchema, not both.`);
  }

  const bodySchema = successResponse.dataRef ? refTo(successResponse.dataRef) : successResponse.dataSchema;

  const responses: Record<string, unknown> = {
    [successResponse.status]:
      successResponse.status === 204 || !bodySchema
        ? { description: successResponse.description }
        : {
            description: successResponse.description,
            content: { "application/json": { schema: bodySchema } },
          },
  };

  for (const key of errors) responses[ERROR_STATUS[key]] = ERROR_REFS[key];
  Object.assign(responses, extraResponses);

  const parameters = [...toParameters(params, "path"), ...toParameters(query, "query")];

  return {
    summary,
    ...(description ? { description } : {}),
    tags,
    security: isPublic ? [] : [{ bearerAuth: [] }],
    ...(parameters.length > 0 ? { parameters } : {}),
    ...(body
      ? { requestBody: { required: true, content: { "application/json": { schema: refTo(body) } } } }
      : {}),
    responses,
  };
}
