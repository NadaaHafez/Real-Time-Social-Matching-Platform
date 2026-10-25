/**
 * Two dev users sign in, connect, roll, get matched, chat, then one leaves.
 *
 *   yarn dev               (in another terminal)
 *   yarn demo:match        (API_URL defaults to http://localhost:8000)
 */
import type { ClientToServerEvents, ServerToClientEvents } from "@social-matching/shared";
import { io, Socket } from "socket.io-client";

const API = process.env.API_URL ?? "http://localhost:8000";
type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

async function call<T>(path: string, init: { method?: string; token?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: init.method ?? "GET",
    headers: {
      "content-type": "application/json",
      ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const data = res.status === 204 ? null : await res.json();
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${path} → ${res.status} ${JSON.stringify(data)}`);
  return data as T;
}

/** A ready-to-roll user: signed in, onboarded, welcome Rolls claimed, socket open. */
async function setUp(username: string, profile: { age: number; gender: string; country: string }) {
  const { tokens } = await call<{ tokens: { accessToken: string } }>("/dev/signin", { method: "POST", body: { username } });
  const token = tokens.accessToken;

  await call("/me/profile", { method: "PATCH", token, body: profile });
  await call("/rolls/welcome", { method: "POST", token });

  const socket: Client = io(API, { auth: { token }, transports: ["websocket"] });
  await new Promise<void>((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("connect_error", reject);
  });

  return { username, token, socket };
}

const next = <E extends keyof ServerToClientEvents>(socket: Client, event: E) =>
  new Promise<Parameters<ServerToClientEvents[E]>[0]>((resolve) => {
    socket.once(event, ((payload: Parameters<ServerToClientEvents[E]>[0]) => resolve(payload)) as never);
  });

async function main() {
  const alice = await setUp("alice", { age: 25, gender: "female", country: "EG" });
  const bob = await setUp("bob", { age: 28, gender: "male", country: "SA" });
  console.log("✓ alice and bob signed in, onboarded and connected");

  const found = [next(alice.socket, "match:found"), next(bob.socket, "match:found")];

  for (const user of [alice, bob]) {
    const ticket = await call<{ rollCost: number; balance: { available: number; held: number } }>(
      "/matchmaking/roll",
      { method: "POST", token: user.token },
    );
    console.log(`✓ ${user.username} rolled: cost ${ticket.rollCost}, balance ${JSON.stringify(ticket.balance)}`);
  }

  const [forAlice, forBob] = await Promise.all(found);
  const { sessionId } = forAlice;
  const describe = (p: typeof forAlice.partner) => `${p.displayName}, ${p.age}, ${p.gender}, ${p.country}`;
  console.log(`✓ matched in session ${sessionId}`);
  console.log(`  alice sees: ${describe(forAlice.partner)} | bob sees: ${describe(forBob.partner)}`);

  // Bob sees Alice typing, then her message.
  const typing = next(bob.socket, "chat:typing");
  alice.socket.emit("chat:typing", { sessionId, typing: true });
  console.log(`✓ bob sees typing: ${JSON.stringify(await typing)}`);

  const toBob = next(bob.socket, "chat:message");
  const sent = await alice.socket.emitWithAck("chat:message", { sessionId, body: "  Hi from Egypt!  " });
  const received = await toBob;
  console.log(`✓ alice sent (ack ${JSON.stringify(sent)}); bob got "${received.body}" from ${received.author}`);

  const toAlice = next(alice.socket, "chat:message");
  await bob.socket.emitWithAck("chat:message", { sessionId, body: "Hello from Saudi!" });
  console.log(`✓ alice got "${(await toAlice).body}" from ${(await toAlice).author}`);

  const current = await call<{ chat: unknown }>("/chat/current", { token: bob.token });
  console.log(`✓ GET /chat/current for bob: ${JSON.stringify(current.chat)}`);

  const ended = next(bob.socket, "session:ended");
  const ack = await alice.socket.emitWithAck("session:leave", { sessionId });
  console.log(`✓ alice left: ${JSON.stringify(ack)}; bob was told: ${JSON.stringify(await ended)}`);

  for (const user of [alice, bob]) {
    const balance = await call("/rolls/balance", { token: user.token });
    console.log(`  ${user.username} balance after: ${JSON.stringify(balance)}`);
    user.socket.close();
  }
}

main().catch((err) => {
  console.error("✗", err instanceof Error ? err.message : err);
  process.exit(1);
});
