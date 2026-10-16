import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

/**
 * Every environment variable, parsed once at boot.
 *
 * A missing secret fails here with its name, rather than as a confusing 401 from Pi three
 * screens later. The rest of the app imports `env` and never touches `process.env`.
 */
const origins = z
  .string()
  .default("http://localhost:3000")
  // CORS matches the Origin header exactly, so a trailing slash or stray space silently
  // rejects every request while looking correct in the dashboard.
  .transform((value) =>
    value
      .split(",")
      .map((origin) => origin.trim().replace(/\/$/, ""))
      .filter(Boolean),
  );

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(8000),
  DATABASE_URL: z.string().min(1),

  PI_API_KEY: z.string().min(1),
  PLATFORM_API_URL: z.string().url().default("https://api.minepi.com"),

  JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET must be at least 32 characters"),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(15 * 60),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),

  FRONTEND_URL: origins,
  /** Proxies in front of this process. Wrong, and every req.ip we log and rate-limit on is wrong. */
  TRUST_PROXY_HOPS: z.coerce.number().int().nonnegative().default(1),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const problems = parsed.error.errors.map((e) => `  ${e.path.join(".")}: ${e.message}`).join("\n");
  throw new Error(`Invalid environment. Copy .env.example to .env and fill it in.\n${problems}`);
}

const raw = parsed.data;

const env = {
  nodeEnv: raw.NODE_ENV,
  isProduction: raw.NODE_ENV === "production",
  port: raw.PORT,
  databaseUrl: raw.DATABASE_URL,
  piApiKey: raw.PI_API_KEY,
  platformApiUrl: raw.PLATFORM_API_URL,
  jwtAccessSecret: raw.JWT_ACCESS_SECRET,
  accessTokenTtlSeconds: raw.ACCESS_TOKEN_TTL_SECONDS,
  refreshTokenTtlDays: raw.REFRESH_TOKEN_TTL_DAYS,
  frontendUrls: raw.FRONTEND_URL,
  trustProxyHops: raw.TRUST_PROXY_HOPS,
} as const;

export default env;
