import prisma from "../../config/database";

const SETTINGS_ID = 1;

/**
 * The one Settings row. Created with the schema defaults the first time it is read, so a
 * fresh database needs no seed step.
 */
export async function getSettings() {
  return prisma.settings.upsert({
    where: { id: SETTINGS_ID },
    update: {},
    create: { id: SETTINGS_ID },
  });
}
