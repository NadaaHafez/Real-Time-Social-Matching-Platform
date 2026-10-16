import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// Used by the Prisma CLI (migrate, studio). The running app connects through the driver
// adapter in src/config/database.ts instead. Prisma 7 removed `url` from the datasource.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
