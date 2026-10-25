import { z } from "zod";

/** Owner-only configuration. Bounds keep a typo from breaking the app. */

const int = (min: number, max: number) => z.number().int().min(min).max(max);

// ============================================================================
// SETTINGS
// ============================================================================

export const appSettingsSchema = z
  .object({
    minimumAge: int(13, 120),
    welcomeRolls: int(0, 1000).describe("0 turns the welcome grant off."),
    streakRewards: z.array(int(1, 1000)).min(1).max(31).describe("Rolls per streak day, day 1 first."),

    baseRollCost: int(1, 1000).describe("A roll with every filter off. At least 1."),
    ageFilterCost: int(0, 1000),
    genderFilterCost: int(0, 1000),
    countryFilterCost: int(0, 1000),

    freeIncludeSlots: int(0, 250),
    freeExcludeSlots: int(0, 250),
    includeSlotPrice: int(1, 10_000),
    excludeSlotPrice: int(1, 10_000),
    maxExtraIncludeSlots: int(0, 250),
    maxExtraExcludeSlots: int(0, 250),

    matchTimeoutSeconds: int(10, 300),
    blockHours: int(0, 8760).describe("How long a report keeps a pair apart. 0 turns blocking off."),
  })
  .describe("Everything an owner can change without a deploy.");
export type AppSettings = z.infer<typeof appSettingsSchema>;

export const updateSettingsRequestSchema = appSettingsSchema
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, { message: "Provide at least one setting to change" })
  .describe("Send only what changes. Applies from the next request.");
export type UpdateSettingsRequest = z.infer<typeof updateSettingsRequestSchema>;

// ============================================================================
// ROLL PACKS
// ============================================================================

export const packIdParamsSchema = z.object({
  packId: z
    .string()
    .regex(/^[a-z0-9-]{2,30}$/, "2-30 lowercase letters, digits or dashes")
    .describe("Stable slug the client sends as `metadata.packId`, like `starter`."),
});
export type PackIdParams = z.infer<typeof packIdParamsSchema>;

export const savePackRequestSchema = z.object({
  rolls: int(1, 100_000),
  priceInPi: z
    .number()
    .positive()
    .max(1_000_000)
    .refine((price) => Number(price.toFixed(7)) === price, "At most 7 decimal places, like Pi"),
  tag: z.string().trim().min(1).max(30).nullable().describe("Label shown on the pack, like `popular`."),
  active: z.boolean().describe("False hides it from the shop. Packs are never deleted: purchases point at them."),
  sortOrder: int(0, 1000),
});
export type SavePackRequest = z.infer<typeof savePackRequestSchema>;

export const adminPackSchema = savePackRequestSchema.extend({ id: z.string() });
export type AdminPack = z.infer<typeof adminPackSchema>;

// ============================================================================
// OPENAPI COMPONENTS
// ============================================================================

export const adminSchemaComponents = {
  AppSettings: appSettingsSchema,
  UpdateSettingsRequest: updateSettingsRequestSchema,
  SavePackRequest: savePackRequestSchema,
  AdminPack: adminPackSchema,
};
