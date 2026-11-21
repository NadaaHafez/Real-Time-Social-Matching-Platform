import type {
  ClientToServerEvents,
  LegalDocuments,
  RollResponse,
  ServerToClientEvents,
  SignInResponse,
  SocketAck,
} from "@social-matching/shared";
import { io, type Socket } from "socket.io-client";

import { ApiError, request } from "./api";
import { counters, record, recordError } from "./stats";

export type BotOptions = {
  url: string;
  username: string;
  /** Multiplies every pause; 0.2 makes bots five times faster than people. */
  pace: number;
};

export type BotState = "starting" | "idle" | "rolling" | "chatting" | "stopped";

type MatchOutcome = "matched" | "expired" | "stopped";

const GENDERS = ["male", "female", "other"] as const;
const COUNTRIES = ["EG", "US", "GB", "DE", "FR", "IN", "BR", "NG", "PK", "SA"];
const LINES = ["hey", "hi! where are you from?", "nice", "haha same", "what do you do?", "cool", "gotta go, bye"];
const ROLLS_TOPUP = 10_000;

const random = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1));
const pick = <T>(list: readonly T[]) => list[random(0, list.length - 1)];
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class Bot {
  state: BotState = "starting";
  private token = "";
  private stopping = false;
  private socket?: Socket<ServerToClientEvents, ClientToServerEvents>;
  private sessionId: string | null = null;
  // Resolvers for the socket event a step is waiting on.
  private onMatch?: (outcome: MatchOutcome) => void;
  private onSessionEnd?: () => void;

  constructor(private readonly options: BotOptions) {}

  get accessToken(): string {
    return this.token;
  }

  /** Sign in, onboard, top up, connect; then roll and chat until stop(). */
  async run(): Promise<void> {
    try {
      await this.setUp();
    } catch (error) {
      recordError(`setup:${error instanceof ApiError ? error.code : "failed"}`);
      return this.shutDown();
    }

    while (!this.stopping) {
      try {
        await this.rollAndChat();
      } catch (error) {
        recordError(error instanceof ApiError ? error.code : "bot_error");
      }
      if (this.stopping) break;
      this.state = "idle";
      await this.pause(1_000, 4_000);
    }
    await this.shutDown();
  }

  /** Ends the current wait early; run() then cancels or leaves and disconnects. */
  stop(): void {
    this.stopping = true;
    this.onMatch?.("stopped");
    this.onSessionEnd?.();
  }

  // --------------------------------------------------------------------------
  // SET-UP: the same calls a new user's app makes
  // --------------------------------------------------------------------------

  private async setUp(): Promise<void> {
    await this.signIn();
    await this.call("PATCH", "/me/profile", { age: random(18, 45), gender: pick(GENDERS), country: pick(COUNTRIES) });

    const legal = await this.call<LegalDocuments>("GET", "/legal");
    if (legal.terms) await this.call("POST", "/me/terms", { documentId: legal.terms.id });

    await this.call("POST", "/rolls/welcome");
    await this.call("POST", "/dev/rolls", { amount: ROLLS_TOPUP });
    await this.connect();
    this.state = "idle";
  }

  private async signIn(): Promise<void> {
    const res = await request<SignInResponse>(this.options.url, "POST", "/dev/signin", {
      body: { username: this.options.username },
    });
    this.token = res.tokens.accessToken;
    counters.signIns++;
  }

  /** An authed call. On 401 (the 15-minute token ran out) signs in again and retries once. */
  private async call<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
    try {
      return await request<T>(this.options.url, method, path, { token: this.token, body });
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401) throw error;
      await this.signIn();
      return request<T>(this.options.url, method, path, { token: this.token, body });
    }
  }

  private connect(): Promise<void> {
    const started = performance.now();
    // forceNew: otherwise socket.io shares one connection between every bot in this process.
    const socket = io(this.options.url, {
      auth: (send) => send({ token: this.token }),
      transports: ["websocket"],
      forceNew: true,
    });
    this.socket = socket;

    socket.on("match:found", (event) => {
      this.sessionId = event.sessionId;
      this.onMatch?.("matched");
    });
    socket.on("match:ended", () => this.onMatch?.("expired"));
    socket.on("session:ended", (event) => {
      if (event.sessionId !== this.sessionId) return;
      counters.sessionsEnded++;
      this.sessionId = null;
      this.onSessionEnd?.();
    });
    socket.on("chat:message", (message) => {
      if (message.author !== "partner") return;
      counters.messagesReceived++;
      // Bodies start with the send time. All bots share this clock, so the gap is real delivery time.
      const sentAt = Number(message.body.split(" ", 1)[0]);
      if (sentAt) record("socket message delivery", Date.now() - sentAt);
    });
    socket.on("disconnect", (reason) => {
      if (this.state === "stopped") return;
      recordError(`socket:${reason}`);
      // The server hung up (e.g. an expired token): sign in again and reconnect.
      if (reason === "io server disconnect") void this.signIn().then(() => socket.connect(), () => undefined);
    });

    return new Promise((resolve, reject) => {
      socket.once("connect", () => {
        record("socket connect", performance.now() - started);
        resolve();
      });
      socket.once("connect_error", (error) => reject(new ApiError(0, `socket_${error.message}`)));
    });
  }

  // --------------------------------------------------------------------------
  // THE LOOP: roll, chat a little, leave (or get left)
  // --------------------------------------------------------------------------

  private async rollAndChat(): Promise<void> {
    this.state = "rolling";
    const started = performance.now();
    // Listen before rolling: match:found can arrive before the HTTP response does.
    const outcome = new Promise<MatchOutcome>((resolve) => (this.onMatch = resolve));

    let roll: RollResponse;
    try {
      roll = await this.call<RollResponse>("POST", "/matchmaking/roll");
    } catch (error) {
      this.onMatch = undefined;
      this.state = "idle";
      if (error instanceof ApiError && error.code === "insufficient_rolls") {
        await this.call("POST", "/dev/rolls", { amount: ROLLS_TOPUP });
      }
      throw error;
    }
    counters.rolls++;

    // A search that outlives its expiry by a minute means the socket event was lost.
    const deadline = new Date(roll.expiresAt).getTime() - Date.now() + 60_000;
    const result = await Promise.race([outcome, sleep(deadline).then(() => "lost" as const)]);
    this.onMatch = undefined;

    if (result === "stopped") return; // still "rolling": shutDown() cancels it
    this.state = "idle";
    if (result === "lost") return recordError("match_event_lost");
    if (result === "expired") {
      counters.expired++;
      return;
    }
    counters.matches++;
    record("time to match", performance.now() - started);
    await this.chat();
  }

  private async chat(): Promise<void> {
    const sessionId = this.sessionId;
    if (!sessionId) return;
    this.state = "chatting";
    const ended = new Promise<void>((resolve) => (this.onSessionEnd = resolve));
    const stillHere = () => this.sessionId === sessionId && !this.stopping;

    const messages = random(2, 6);
    for (let i = 0; i < messages && stillHere(); i++) {
      await Promise.race([this.pause(1_500, 5_000), ended]);
      if (!stillHere()) break;
      this.socket?.emit("chat:typing", { sessionId, typing: true });
      if (await this.emit("chat:message", { sessionId, body: `${Date.now()} ${pick(LINES)}` })) {
        counters.messagesSent++;
      }
    }

    // Done talking: leave, unless the partner already did.
    if (stillHere()) await Promise.race([this.pause(500, 2_000), ended]);
    if (this.sessionId === sessionId) await this.emit("session:leave", { sessionId });
    await Promise.race([ended, sleep(10_000)]);
    this.onSessionEnd = undefined;
    this.sessionId = null;
  }

  /** Emits with an ack, timed. Failed acks are recorded by error code. */
  private async emit(
    event: "chat:message" | "session:leave",
    payload: { sessionId: string; body?: string },
  ): Promise<boolean> {
    const socket = this.socket;
    if (!socket?.connected) {
      recordError("socket_not_connected");
      return false;
    }
    const started = performance.now();
    let ack: SocketAck;
    try {
      ack =
        event === "chat:message"
          ? await socket.timeout(10_000).emitWithAck(event, { sessionId: payload.sessionId, body: payload.body ?? "" })
          : await socket.timeout(10_000).emitWithAck(event, { sessionId: payload.sessionId });
    } catch {
      ack = { ok: false, error: "ack_timeout", message: "" };
    }
    record(`socket ${event} ack`, performance.now() - started);
    // The partner left a moment earlier. Real users hit this too; it isn't a server fault.
    if (!ack.ok && ack.error === "session_not_found") counters.races++;
    else if (!ack.ok) recordError(`${event}:${ack.error}`);
    return ack.ok;
  }

  // --------------------------------------------------------------------------
  // SHUT-DOWN
  // --------------------------------------------------------------------------

  private async shutDown(): Promise<void> {
    try {
      if (this.state === "rolling") await this.call("POST", "/matchmaking/cancel");
      if (this.sessionId) await this.emit("session:leave", { sessionId: this.sessionId });
    } catch {
      // Ending anyway; the server cleans up when the socket closes.
    }
    this.state = "stopped";
    this.socket?.disconnect();
  }

  /** A human-ish pause, scaled by --pace. */
  private pause(minMs: number, maxMs: number): Promise<void> {
    return sleep(random(minMs, maxMs) * this.options.pace);
  }
}
