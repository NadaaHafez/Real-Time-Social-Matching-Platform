import env from "../config/env";
import { adminRoutePaths } from "../routes/admin/admin.routes";
import { authRoutePaths } from "../routes/auth/auth.routes";
import { chatRoutePaths } from "../routes/chat/chat.routes";
import { devRoutePaths } from "../routes/dev/dev.routes";
import { healthRoutePaths } from "../routes/health/health.routes";
import { legalRoutePaths } from "../routes/legal/legal.routes";
import { filtersRoutePaths } from "../routes/filters/filters.routes";
import { matchmakingRoutePaths } from "../routes/matchmaking/matchmaking.routes";
import { paymentsRoutePaths } from "../routes/payments/payments.routes";
import { profileRoutePaths } from "../routes/profile/profile.routes";
import { rollsRoutePaths } from "../routes/rolls/rolls.routes";
import { getSchemaRegistry } from "./defineRoute";
import { generateSchemaComponents } from "./zodToOpenApi";

/**
 * Assembles the OpenAPI document: every route file exports its
 * `xxxRoutePaths`, and `components/schemas` is built from the shared package's
 * `allSchemaComponents` plus any backend-only schemas.
 *
 * The route imports come first on purpose: importing a route module is what runs its
 * `registerLocalSchema` calls, so the registry is complete by the time it is read below.
 */

const DEMO_NOTE = `
> **Demo instance.** Sign in as anyone with \`POST /dev/signin\` \`{ "username": "alice" }\`, then paste
> \`tokens.accessToken\` into **Authorize**. Data may be wiped at any time.
`.trim();

const DESCRIPTION = `
REST API for the Real-Time Social Matching Platform, a Pi Network app.

**Generated from the code.** Request and response schemas are the same Zod objects the
server validates with, imported from \`@social-matching/shared\` — the package clients use too.

## Authentication

\`POST /auth/signin\` returns an access token (JWT, short-lived) and a refresh token.
Send the access token as \`Authorization: Bearer <token>\`. When a call returns
\`401 token_expired\`, trade the refresh token at \`POST /auth/refresh\`.

Refresh tokens are single use. Presenting one twice signs the account out everywhere.

## Response shape

Success returns the bare object, or \`204\` with no body. Failure always returns
\`{ error, message }\`: branch on \`error\`, show \`message\`.
`.trim();

const errorRef = (description: string) => ({
  description,
  content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
});

/** Add each route file's paths here when its feature lands. */
const paths = {
  ...healthRoutePaths,
  ...authRoutePaths,
  ...legalRoutePaths,
  ...profileRoutePaths,
  ...filtersRoutePaths,
  ...rollsRoutePaths,
  ...paymentsRoutePaths,
  ...matchmakingRoutePaths,
  ...chatRoutePaths,
  ...adminRoutePaths,
  // Documented only where app.ts mounts it.
  ...(env.devToolsEnabled ? devRoutePaths : {}),
};

export const swaggerSpec = {
  openapi: "3.0.0",
  info: {
    title: env.demoMode ? "Social Matching API (demo)" : "Social Matching API",
    version: "0.1.0",
    description: env.demoMode ? `${DEMO_NOTE}\n\n${DESCRIPTION}` : DESCRIPTION,
  },
  servers: [
    { url: "/", description: "This server" },
    { url: `http://localhost:${env.port}`, description: "Local development" },
  ],
  tags: [
    { name: "Health", description: "Liveness and database reachability." },
    { name: "Auth", description: "Pi sign-in, token refresh and sign-out." },
    { name: "Legal", description: "Terms of use and privacy policy, published as revisions." },
    { name: "Profile", description: "The signed-in user's own profile." },
    { name: "Filters", description: "Who a user wants to match with, and the country slots they own." },
    { name: "Rolls", description: "The in-app currency: balance, history, welcome grant and daily streak." },
    { name: "Payments", description: "Buying Roll packs with Pi, through the Pi SDK's U2A payment flow." },
    { name: "Matchmaking", description: "Searching for a partner. Outcomes arrive over Socket.IO." },
    { name: "Chat", description: "1-on-1 chat. Messages travel over Socket.IO and are never stored." },
    { name: "Admin", description: "Moderators and owners: the report queue and its decisions." },
    ...(env.devToolsEnabled ? [{ name: "Dev", description: "Development and demo only. Not mounted in production." }] : []),
  ],
  components: {
    schemas: generateSchemaComponents(getSchemaRegistry()),
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "The `accessToken` from `POST /auth/signin` or `POST /auth/refresh`.",
      },
    },
    responses: {
      ValidationError: errorRef("The request did not match the schema — `validation_failed`."),
      UnauthorizedError: errorRef(
        "Missing or invalid access token — `unauthorized` / `invalid_token`, or `token_expired` " +
          "(refresh and retry).",
      ),
      ForbiddenError: errorRef(
        "The account is suspended or banned — `account_suspended` / `account_banned`. Checked on " +
          "every request, so a ban applies immediately.",
      ),
      NotFoundError: errorRef("The resource does not exist — `not_found`."),
      ConflictError: errorRef("The request conflicts with the current state."),
      RateLimitedError: errorRef("Too many requests from this IP — `rate_limited` / `too_many_auth_attempts`."),
      InternalError: errorRef("An unhandled server error — `internal_error`."),
    },
  },
  security: [{ bearerAuth: [] }],
  paths,
};

export default swaggerSpec;
