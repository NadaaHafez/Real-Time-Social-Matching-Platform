import { createServer } from "http";

import app from "./app";
import prisma from "./config/database";
import env from "./config/env";
import logger from "./config/logger";
import { attachSocketServer, closeSocketServer } from "./realtime/socket";
import { startMatchmaker, stopMatchmaker } from "./services/matchmaking/matchmaking.service";
import { loadOpenSessions } from "./services/sessions/session.service";
import { registerSocketHandlers } from "./sockets";

/** How long in-flight requests get to finish before the process exits anyway. */
const SHUTDOWN_GRACE_MS = 10_000;

/** Stops new work arriving first (the port), then closes Postgres. */
async function shutdown(signal: string): Promise<void> {
  logger.info("Shutting down", { signal });

  const forced = setTimeout(() => {
    logger.warn("Shutdown timed out, exiting anyway", { afterMs: SHUTDOWN_GRACE_MS });
    process.exit(1);
  }, SHUTDOWN_GRACE_MS);

  try {
    stopMatchmaker();
    // Closes the sockets and the HTTP server they are attached to. Rolls still waiting are
    // refunded by startMatchmaker on the next boot.
    await closeSocketServer();
    await prisma.$disconnect();
  } catch (err) {
    logger.error("Shutdown failed", { err: err instanceof Error ? err.message : String(err) });
  }

  clearTimeout(forced);
  process.exit(0);
}

/**
 * Connect to Postgres before opening the port. A server that accepts connections it cannot
 * serve is harder to diagnose than one that never started.
 */
async function start() {
  try {
    await prisma.$connect();
    logger.info("Connected to PostgreSQL");

    // Before the port opens: rolls refuse users in a chat, and stranded rolls need refunding.
    await loadOpenSessions();
    await startMatchmaker();

    // An explicit http.Server rather than app.listen, so Socket.IO can share the port.
    const server = createServer(app);
    attachSocketServer(server, registerSocketHandlers);

    // Emitted, not thrown, so the try/catch never sees an occupied port.
    server.on("error", (err) => {
      logger.error("Server error", { err: err.message, port: env.port });
      process.exit(1);
    });

    process.on("SIGTERM", () => void shutdown("SIGTERM"));
    process.on("SIGINT", () => void shutdown("SIGINT"));

    server.listen(env.port, () => {
      logger.info(`Backend listening on port ${env.port}`);
      logger.info(`API docs at http://localhost:${env.port}/api-docs`);
    });
  } catch (err) {
    logger.error("Failed to start backend", { err: err instanceof Error ? err.message : String(err) });
    process.exit(1);
  }
}

process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled promise rejection", {
    err: reason instanceof Error ? (reason.stack ?? reason.message) : String(reason),
  });
});

process.on("uncaughtException", (err) => {
  logger.error("Uncaught exception", { err: err.stack ?? err.message });
  process.exit(1);
});

start();
