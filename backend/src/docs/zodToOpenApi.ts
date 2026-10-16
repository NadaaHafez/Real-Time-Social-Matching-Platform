import { z } from "zod";

/**
 * Converts Zod schemas to OpenAPI 3.0 schema objects.
 *
 * Hand-rolled rather than a library, so the shared package can stay plain Zod with no
 * OpenAPI dependency. Descriptions come from `.describe()`.
 *
 * A nested schema that is itself registered becomes a `$ref` instead of an
 * inlined copy, so `PiUser` inside `SignInResponse` points at the one `PiUser` component.
 */
type OpenApiSchema = Record<string, unknown>;
type Registry = Record<string, z.ZodTypeAny>;

function refFor(schema: z.ZodTypeAny, registry?: Registry): OpenApiSchema | null {
  if (!registry) return null;
  const entry = Object.entries(registry).find(([, s]) => s === schema);
  return entry ? { $ref: `#/components/schemas/${entry[0]}` } : null;
}

/** Converts a schema, emitting a `$ref` if it is registered. */
export function zodToOpenApiSchema(schema: z.ZodTypeAny, registry?: Registry): OpenApiSchema {
  const ref = refFor(schema, registry);
  if (ref) return ref;

  return convertInline(schema, registry);
}

/** Converts a schema's body, never as a `$ref` to itself. Used for the component definitions. */
export function convertInline(schema: z.ZodTypeAny, registry?: Registry): OpenApiSchema {
  const converted = convertCore(schema, registry);
  if (schema.description && !converted.$ref) converted.description = schema.description;
  return converted;
}

function convertCore(schema: z.ZodTypeAny, registry?: Registry): OpenApiSchema {
  if (schema instanceof z.ZodString) {
    const out: OpenApiSchema = { type: "string" };
    for (const check of schema._def.checks) {
      if (check.kind === "min") out.minLength = check.value;
      if (check.kind === "max") out.maxLength = check.value;
      if (check.kind === "email") out.format = "email";
      if (check.kind === "url") out.format = "uri";
      if (check.kind === "uuid") out.format = "uuid";
      if (check.kind === "datetime") out.format = "date-time";
    }
    return out;
  }

  if (schema instanceof z.ZodNumber) {
    const out: OpenApiSchema = { type: "number" };
    for (const check of schema._def.checks) {
      if (check.kind === "int") out.type = "integer";
      if (check.kind === "min") out.minimum = check.value;
      if (check.kind === "max") out.maximum = check.value;
    }
    return out;
  }

  if (schema instanceof z.ZodBoolean) return { type: "boolean" };
  if (schema instanceof z.ZodDate) return { type: "string", format: "date-time" };
  if (schema instanceof z.ZodEnum) return { type: "string", enum: schema._def.values };

  if (schema instanceof z.ZodNativeEnum) {
    return { type: "string", enum: Object.values(schema._def.values).filter((v) => typeof v === "string") };
  }

  if (schema instanceof z.ZodLiteral) {
    return { type: typeof schema._def.value, enum: [schema._def.value] };
  }

  if (schema instanceof z.ZodArray) {
    return { type: "array", items: zodToOpenApiSchema(schema._def.type, registry) };
  }

  if (schema instanceof z.ZodObject) {
    const properties: Record<string, OpenApiSchema> = {};
    const required: string[] = [];

    for (const [key, value] of Object.entries(schema.shape as Record<string, z.ZodTypeAny>)) {
      properties[key] = zodToOpenApiSchema(value, registry);
      if (!value.isOptional()) required.push(key);
    }

    return { type: "object", properties, ...(required.length > 0 ? { required } : {}) };
  }

  if (schema instanceof z.ZodOptional) return zodToOpenApiSchema(schema._def.innerType, registry);

  if (schema instanceof z.ZodNullable) {
    const inner = zodToOpenApiSchema(schema._def.innerType, registry);
    // OpenAPI 3.0 ignores siblings of $ref, so a nullable reference needs allOf.
    return inner.$ref ? { allOf: [inner], nullable: true } : { ...inner, nullable: true };
  }

  if (schema instanceof z.ZodDefault) {
    return { ...zodToOpenApiSchema(schema._def.innerType, registry), default: schema._def.defaultValue() };
  }

  if (schema instanceof z.ZodUnion) {
    return { oneOf: schema._def.options.map((o: z.ZodTypeAny) => zodToOpenApiSchema(o, registry)) };
  }

  if (schema instanceof z.ZodIntersection) {
    return {
      allOf: [zodToOpenApiSchema(schema._def.left, registry), zodToOpenApiSchema(schema._def.right, registry)],
    };
  }

  // Refinements and transforms: document the input the client must send.
  if (schema instanceof z.ZodEffects) return zodToOpenApiSchema(schema._def.schema, registry);

  if (schema instanceof z.ZodRecord) {
    return { type: "object", additionalProperties: zodToOpenApiSchema(schema._def.valueType, registry) };
  }

  if (schema instanceof z.ZodLazy) return zodToOpenApiSchema(schema._def.getter(), registry);

  return {};
}

/** `components/schemas`, one entry per registered schema. */
export function generateSchemaComponents(registry: Registry): Record<string, OpenApiSchema> {
  const components: Record<string, OpenApiSchema> = {};

  for (const [name, schema] of Object.entries(registry)) {
    components[name] = convertInline(schema, registry);
  }

  return components;
}
