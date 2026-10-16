import cors from "cors";
import express from "express";
import swaggerUi from "swagger-ui-express";

import env from "./config/env";
import swaggerSpec from "./docs/swagger";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { globalLimiter } from "./middleware/rateLimit";
import { requestLogger } from "./middleware/requestLogger";
import routes from "./routes";

// Side-effect import: the `req.currentUser` augmentation.
import "./types/express";

const app: express.Application = express();

// Behind a proxy in production. The hop count comes from env because a wrong number
// mis-attributes every req.ip we log and rate-limit on.
if (env.isProduction) {
  app.set("trust proxy", env.trustProxyHops);
}

app.use(requestLogger);
app.use(express.json({ limit: "1mb" }));

// An allowlist. No `credentials`: auth is a bearer header, and no cookie crosses origins.
app.use(cors({ origin: env.frontendUrls }));

// After cors, so a 429 still carries the CORS header and the browser shows the real reason.
app.use(globalLimiter);

// ============================================================================
// API DOCUMENTATION
// ============================================================================

app.get("/api-docs.json", (_req, res) => {
  res.json(swaggerSpec);
});

// `swaggerUrl`, not an inline spec: inlining stuffs the whole document into the init script.
app.use(
  "/api-docs",
  // Spread: `serve` is an array of handlers.
  ...swaggerUi.serve,
  swaggerUi.setup(undefined, {
    swaggerUrl: "/api-docs.json",
    customSiteTitle: "Chat Roulette API",
    swaggerOptions: { persistAuthorization: true, displayRequestDuration: true },
  }),
);

app.get("/docs", (_req, res) => res.redirect("/api-docs"));

app.use(routes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
