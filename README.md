# Real-Time Social Matching Platform

Backend for a Pi Network app that pairs strangers for random 1-on-1 chats. Users sign in with Pi, buy **Rolls** (the in-app currency) with Pi, and spend Rolls each time they get matched. Filters narrow who they meet, and moderators keep it safe.

TypeScript · Node.js · Express · Socket.IO · PostgreSQL · Prisma · Zod · Pi Platform API

## Features

- **Pi sign-in.** Identity is verified server-side with Pi, then the app issues its own JWT access tokens and rotating refresh tokens.
- **Onboarding and profile.** Age, gender and country, with a minimum age the owner can change.
- **Legal terms.** Versioned terms of use and privacy policy. Users accept an exact revision, and a new revision can ask everyone to accept again before their next roll.
- **Rolls.** A balance backed by an append-only ledger, a welcome grant, a daily streak reward, and a paginated wallet history.
- **Payments.** Roll packs bought with Pi through the Pi SDK's U2A flow: approve, sign, complete, plus recovery of payments left incomplete.
- **Match filters.** Age range, gender, and country include or exclude lists, with extra country slots bought with Rolls. Each filter adds to the roll's cost. Matching is mutual: each side must fit the other's filters.
- **Matchmaking.** Rolls are held while searching, spent on a match, and refunded if no one is found in time. The result arrives over Socket.IO.
- **Real-time chat.** 1-on-1 messages and typing indicators over Socket.IO. Partners appear as "Stranger" with age, gender and country. Messages are never stored.
- **Moderation.** Reporting a partner ends the chat and keeps the pair apart for 72 hours. Moderators warn, suspend or ban from a review queue. A ban takes effect immediately: the chat ends, any search is refunded, and the sockets close.
- **Admin API.** Owners change prices, slots, timeouts and other settings, manage Roll packs and publish legal documents, all without a deploy.

## Engineering highlights

- **One contract, no duplicate types.** Every request, response and socket event is a Zod schema in `packages/shared`. Types are inferred from it, the backend validates with it, and the OpenAPI docs are generated from it. Enums and model shapes are generated from `schema.prisma`, so each is declared once.
- **The client is never trusted.**
  - Sign-in identity comes from Pi's `GET /v2/me`, not from what the client sends.
  - Payments check the amount against the server's own price list and confirm the payment belongs to the caller.
  - Rolls are credited only after Pi confirms the payment, using the transaction id Pi reports.
- **A ledger, not a counter.**
  - Every Roll movement (credit, hold, spend, refund, unlock) is an append-only entry, written in the same transaction as the balance change, under a row lock.
  - Unique idempotency keys make retries, double taps and parallel requests safe: five parallel claims credit once.
- **A centralized, in-memory matchmaker.**
  - Rolls join a queue in memory, and one background pass pairs it, oldest first, with filters and blocks checked both ways.
  - The database is touched twice per roll: when the Rolls are held and when they are spent or refunded.
  - After a crash, searches left waiting are refunded at startup.
- **HTTP for money, sockets for events.** Anything that moves Rolls is an HTTP request: validated, documented and rate-limited. Outcomes the server decides on its own (a match, an expired search, a partner leaving) are pushed over Socket.IO. Socket events are validated with the same shared schemas.
- **Caching where it matters.** Settings, who is in which chat, and the terms check are served from memory and cleared when they change. Sending a chat message costs no database query.
- **Sessions you can revoke.** Refresh tokens are single use and stored only as SHA-256 hashes. Replaying a used one signs the account out everywhere.
- **Honest errors.** One shape, `{ error, message }`, with stable codes, over HTTP and in socket acknowledgements. If Pi is down, the response is `503 pi_unavailable` rather than blaming the user.

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

**See matching and chat work.** With `yarn dev` running, `yarn demo:match` signs in two test users, matches them, sends messages both ways and ends the chat.

**Admin access.** Roles live in the database. To make an account an owner:

```sql
UPDATE users SET role = 'owner' WHERE username = 'alice';
```

## API

| Area | Base path |
|---|---|
| Sign-in, token refresh, sign-out | `/auth` |
| Profile, terms acceptance, warnings, filters | `/me` |
| Legal documents | `/legal` |
| Balance, history, welcome grant, streak | `/rolls` |
| Roll packs and Pi payments | `/payments` |
| Start or cancel a search, queue size | `/matchmaking` |
| Current chat, reporting | `/chat` |
| Report queue (moderators); settings, packs, legal (owners) | `/admin` |
| Health check | `/health` |

Every endpoint, with its request and response schemas, is documented at `/api-docs`.

**Socket.IO.** Connect with `io(url, { auth: { token: accessToken } })`.

| Event | Direction | Meaning |
|---|---|---|
| `match:found` | server → client | Matched; Rolls spent; the chat is open |
| `match:ended` | server → client | The search expired or was cancelled by the server; Rolls refunded |
| `chat:message`, `chat:typing` | both ways | Messages and typing in the open chat |
| `session:leave` | client → server | End the chat |
| `session:ended` | server → client | The chat is over: `you_left` or `partner_left` |

## Project structure

```
packages/shared/        The API contract: Zod schemas and inferred types
  src/schemas/          Hand-written, one file per feature, plus socket event types
  src/generated/        Generated from schema.prisma
backend/
  prisma/               Schema and migrations
  scripts/              Schema generation, docs export, the match demo
  src/routes/           URLs, validation and OpenAPI specs
  src/controllers/      HTTP in, HTTP out
  src/sockets/          Socket events, validated and handed to services
  src/realtime/         The Socket.IO server: auth and helpers
  src/services/         Business logic and database access
  src/middleware/       Auth, roles, validation, rate limits, errors
docker-compose.yml      Local Postgres
```

An HTTP request flows: route → validation → `requireUser` → controller → service. A socket event flows: `sockets/` → validation → service. Services never parse input or touch a socket directly; they throw `HttpError`, which becomes `{ error, message }` in an HTTP response or a socket acknowledgement.
