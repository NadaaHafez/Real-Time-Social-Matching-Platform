import type { ZodTypeAny } from "zod";

import { prismaEnumSchemaComponents } from "./generated/prisma";
import { authSchemaComponents } from "./schemas/auth.schema";
import { commonSchemaComponents } from "./schemas/common.schema";
import { profileSchemaComponents } from "./schemas/profile.schema";

/**
 * Every named schema, for the backend's OpenAPI builder. Add each feature's
 * `xxxSchemaComponents` here when the feature lands.
 */
export const allSchemaComponents: Record<string, ZodTypeAny> = {
  ...prismaEnumSchemaComponents,
  ...commonSchemaComponents,
  ...authSchemaComponents,
  ...profileSchemaComponents,
};
