import type { ZodTypeAny } from "zod";

import { prismaEnumSchemaComponents } from "./generated/prisma";
import { authSchemaComponents } from "./schemas/auth.schema";
import { commonSchemaComponents } from "./schemas/common.schema";
import { profileSchemaComponents } from "./schemas/profile.schema";
import { filtersSchemaComponents } from "./schemas/filters.schema";
import { matchmakingSchemaComponents } from "./schemas/matchmaking.schema";
import { paymentsSchemaComponents } from "./schemas/payments.schema";
import { rollsSchemaComponents } from "./schemas/rolls.schema";

/**
 * Every named schema, for the backend's OpenAPI builder. Add each feature's
 * `xxxSchemaComponents` here when the feature lands.
 */
export const allSchemaComponents: Record<string, ZodTypeAny> = {
  ...prismaEnumSchemaComponents,
  ...commonSchemaComponents,
  ...authSchemaComponents,
  ...profileSchemaComponents,
  ...rollsSchemaComponents,
  ...paymentsSchemaComponents,
  ...filtersSchemaComponents,
  ...matchmakingSchemaComponents,
};
