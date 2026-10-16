import { PrismaPg } from "@prisma/adapter-pg";

import env from "./env";
import logger from "./logger";
import { Prisma, PrismaClient } from "../../generated/prisma/client";

/** Limits a query to users that have not been deleted. */
const active = <A extends { where?: unknown }>(args: A): A =>
  ({ ...args, where: { ...(args?.where as object), deletedAt: null } }) as A;

/**
 * Soft-deletes users so reports and history survive account closure. Normal reads and
 * updates never see a deleted user; `delete` becomes setting `deletedAt`.
 *
 * Not applied to users loaded through relations or `upsert`.
 */
function softDeleteUser(base: PrismaClient) {
  return Prisma.defineExtension({
    name: "soft-delete-user",
    query: {
      user: {
        findUnique: ({ args, query }) => query(active(args)),
        findUniqueOrThrow: ({ args, query }) => query(active(args)),
        findFirst: ({ args, query }) => query(active(args)),
        findFirstOrThrow: ({ args, query }) => query(active(args)),
        findMany: ({ args, query }) => query(active(args)),
        count: ({ args, query }) => query(active(args)),
        update: ({ args, query }) => query(active(args)),
        updateMany: ({ args, query }) => query(active(args)),
        delete: ({ args }) => base.user.update({ ...args, data: { deletedAt: new Date() } }),
        deleteMany: ({ args }) => base.user.updateMany({ ...args, data: { deletedAt: new Date() } }),
      },
    },
  });
}

const createPrismaClient = () => {
  const client = new PrismaClient({
    adapter: new PrismaPg({ connectionString: env.databaseUrl }),
    // Emitted as events so they come out through our logger as single-line JSON.
    log: [
      { level: "warn", emit: "event" },
      { level: "error", emit: "event" },
    ],
  });

  client.$on("error", (event) => logger.warn("Prisma query failed", { err: event.message }));
  client.$on("warn", (event) => logger.warn("Prisma warning", { err: event.message }));

  // Listeners first: `$on` is unavailable on the extended client.
  return client.$extends(softDeleteUser(client));
};

declare global {
  // eslint-disable-next-line no-var
  var prisma: ReturnType<typeof createPrismaClient> | undefined;
}

/** Reused across dev reloads so each one doesn't open another connection pool. */
const prisma = globalThis.prisma ?? createPrismaClient();
if (!env.isProduction) globalThis.prisma = prisma;

export type TransactionClient = Omit<
  ReturnType<typeof createPrismaClient>,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;

export default prisma;
