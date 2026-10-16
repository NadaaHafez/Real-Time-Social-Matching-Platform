# Real-Time Social Matching Platform

Backend for a Pi Network app that pairs strangers for random 1-on-1 chats. Users sign in with Pi, buy **Rolls** (the in-app currency) with Pi, and spend a Roll each time they get matched. Filters narrow who they meet, and moderators keep it safe.

TypeScript · Node.js · Express · PostgreSQL · Prisma · Zod · WebSockets · Pi Platform API

## Features

- **Pi sign-in.** Identity is verified server-side with Pi, then the app issues its own JWT access tokens and rotating refresh tokens.
- **Onboarding and profile.** Age, gender and country, with an admin-configurable minimum age.
- **Legal terms.** Versioned terms of use and privacy policy. Users accept an exact revision, and a new revision can ask everyone to accept again.
- **Rolls.**
  - A balance backed by an append-only ledger.
  - A welcome grant and a daily streak reward.
  - A paginated wallet history.
- **Payments.** Roll packs bought with Pi through the Pi SDK's U2A flow: approve, sign, complete, plus recovery of incomplete payments.
- **Match filters.**
  - Age range and gender.
  - Country include or exclude lists, with extra country slots bought with Rolls.
  - Matching is mutual: each side must fit the other's filters.
- **Matchmaking.**
  - A Roll is held while searching.
  - It's spent on a match, and refunded if no one is found in time.
- **Real-time chat.** 1-on-1 conversations over WebSockets, with an optional ice-breaker message.
- **Moderation.** Reports from chats, warnings, and suspensions or bans that take effect on the next request.
- **Admin API.** Settings, Roll packs, legal documents and reports, behind app roles (`moderator`, `owner`).

## Engineering highlights

- **One contract, no duplicate types.** Every request and response is a Zod schema in `packages/shared`. Types are inferred from it, the backend validates with it, and the OpenAPI docs are generated from it. Enums and model shapes are generated from `schema.prisma`, so each is declared once.
- **The client is never trusted.**
  - Sign-in identity comes from Pi's `GET /v2/me`, not from what the client sends.
  - Payments check the amount against the server's own price list and confirm the payment belongs to the caller.
  - Rolls are credited only after Pi confirms the payment.
- **A ledger, not a counter.**
  - Every Roll movement is an append-only entry, written in the same transaction as the balance change, under a row lock.
  - Unique idempotency keys make retries, double taps and parallel requests safe.
- **Sessions you can revoke.**
  - Refresh tokens are single use and stored only as SHA-256 hashes.
  - Replaying a used token signs the account out everywhere.
  - Bans apply on the very next request.
- **Honest errors.** One response shape, `{ error, message }`, with stable machine-readable codes. If Pi is down, the response is `503 pi_unavailable` rather than blaming the user.
- **Reviewable without Pi.** A development-only sign-in lets anyone try the whole API from Swagger.

## Getting started

Needs Node 20+, Yarn 1 and Docker.

```bash
yarn install
docker compose up -d                 # Postgres on localhost:5433
cp backend/.env.example backend/.env # then set JWT_ACCESS_SECRET (command is in the file)
yarn prisma:generate
yarn db:migrate
yarn dev
```

Open **http://localhost:8000/api-docs**.

**No Pi account needed.** In development, `POST /dev/signin` with `{ "username": "alice" }` returns tokens for a test user. Paste `tokens.accessToken` into **Authorize** to try every endpoint. This route is not mounted in production. `PI_API_KEY` is only needed to test with a real Pi sandbox app.

## API

| Area | Base path |
|---|---|
| Sign-in, token refresh, sign-out | `/auth` |
| Profile, terms acceptance, filters | `/me` |
| Legal documents | `/legal` |
| Balance, history, welcome grant, streak | `/rolls` |
| Roll packs and Pi payments | `/payments` |
| Matchmaking | `/matchmaking` |
| Chat sessions and reports | `/chat` |
| Admin console | `/admin` |
| Health check | `/health` |

Every endpoint, with its request and response schemas, is documented at `/api-docs`.

## Project structure

```
packages/shared/        The API contract: Zod schemas and inferred types
  src/schemas/          Hand-written, one file per feature
  src/generated/        Generated from schema.prisma
backend/
  prisma/               Schema and migrations
  src/routes/           URLs, validation and OpenAPI specs
  src/controllers/      HTTP in, HTTP out
  src/services/         Business logic and database access
  src/middleware/       Auth, validation, rate limits, errors
docker-compose.yml      Local Postgres
```

A request flows: route → validation → `requireUser` → controller → service. Services throw `HttpError`, and a single error handler turns every error into `{ error, message }`.
