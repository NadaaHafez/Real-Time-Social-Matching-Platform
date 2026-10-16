import env from "./env";

/**
 * Structured JSON in production so a log aggregator can parse it, readable lines in
 * development. Swap for Pino when there is somewhere to ship logs; nothing outside this
 * file needs to change.
 */
type Level = "info" | "warn" | "error";

function write(level: Level, message: string, meta?: Record<string, unknown>) {
  if (env.isProduction) {
    console[level](JSON.stringify({ level, message, ...meta, at: new Date().toISOString() }));
    return;
  }

  console[level](`[${level}] ${message}`, meta ?? "");
}

const logger = {
  info: (message: string, meta?: Record<string, unknown>) => write("info", message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => write("warn", message, meta),
  error: (message: string, meta?: Record<string, unknown>) => write("error", message, meta),
};

export default logger;
