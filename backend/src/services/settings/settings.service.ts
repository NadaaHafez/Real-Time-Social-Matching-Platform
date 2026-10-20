import prisma from "../../config/database";

const SETTINGS_ID = 1;

/** Fallback only. Saves through the app call invalidateSettings(); this catches manual DB edits. */
const CACHE_TTL_MS = 60_000;

/**
 * The one Settings row. Created with the schema defaults the first time it is read. `async`
 * turns Prisma's lazy query into a real Promise, which runs once however many await it.
 */
async function load() {
  return prisma.settings.upsert({ where: { id: SETTINGS_ID }, update: {}, create: { id: SETTINGS_ID } });
}

export type Settings = Awaited<ReturnType<typeof load>>;

// The promise is cached, not the value, so concurrent first reads share one query.
let cached: { value: Promise<Settings>; expiresAt: number } | null = null;

/** Read on every roll and filter change, so served from memory. */
export function getSettings(): Promise<Settings> {
  if (!cached || cached.expiresAt <= Date.now()) {
    const value = load();
    cached = { value, expiresAt: Date.now() + CACHE_TTL_MS };

    // A failed read must not be served for the next minute.
    value.catch(() => {
      if (cached?.value === value) cached = null;
    });
  }

  return cached.value;
}

/** Call after saving Settings, so the next read sees the change. */
export function invalidateSettings(): void {
  cached = null;
}
