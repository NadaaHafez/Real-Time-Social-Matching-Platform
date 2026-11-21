import { fork, type ChildProcess } from "node:child_process";
import { cpus } from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";

import type { QueueStats, SignInResponse } from "@social-matching/shared";

import { request } from "./api";
import { errorCount, hasError, merge, printReport, type Counters } from "./stats";
import type { ParentMessage, ProgressMessage, WorkerMessage } from "./worker";

const { values: args } = parseArgs({
  options: {
    url: { type: "string", default: "http://localhost:8000" },
    bots: { type: "string", default: "50" },
    minutes: { type: "string", default: "2" },
    ramp: { type: "string", default: "30" },
    pace: { type: "string", default: "1" },
    workers: { type: "string" },
    cleanup: { type: "boolean", default: false },
    "cleanup-only": { type: "boolean", default: false },
  },
});

const url = args.url.replace(/\/$/, "");
const botCount = Number(args.bots);
const runMs = Number(args.minutes) * 60_000;
const rampMs = Number(args.ramp) * 1_000;
const pace = Number(args.pace);
// About 500 bots per process keeps each event loop idle enough to measure honestly.
const workerCount = Number(args.workers ?? Math.max(1, Math.min(cpus().length - 1, Math.ceil(botCount / 500))));

async function deleteBots(): Promise<void> {
  const { deleted } = await request<{ deleted: number }>(url, "DELETE", "/dev/bots");
  console.log(`Deleted ${deleted} bot accounts.`);
}

/** An extra account that only asks the server how many are searching. */
async function watchQueue(runId: string): Promise<() => Promise<string>> {
  const signIn = () =>
    request<SignInResponse>(url, "POST", "/dev/signin", { body: { username: `bot_${runId}_watch` } }).then(
      (res) => res.tokens.accessToken,
    );
  let token = await signIn();
  return async () => {
    try {
      return String((await request<QueueStats>(url, "GET", "/matchmaking/queue", { token })).waiting);
    } catch {
      token = await signIn().catch(() => token);
      return "?";
    }
  };
}

function startWorker(message: ParentMessage, onMessage: (message: WorkerMessage) => void): ChildProcess {
  const child = fork(path.join(__dirname, "worker.ts"), [], { execArgv: ["-r", "ts-node/register/transpile-only"] });
  child.on("message", onMessage);
  child.send(message);
  return child;
}

async function main(): Promise<void> {
  if (args["cleanup-only"]) return deleteBots();

  // Unique per run, so each run starts with fresh accounts. Fits the 30-char username limit.
  const runId = Date.now().toString(36).slice(-5);
  console.log(
    `${botCount} bots in ${workerCount} processes → ${url} for ${args.minutes} min ` +
      `(ramp ${args.ramp}s, pace ${pace}). Ctrl+C stops early.\n`,
  );
  const queueSize = await watchQueue(runId);

  const latest = new Map<number, ProgressMessage>();
  const finished: Promise<void>[] = [];
  const workers: ChildProcess[] = [];
  const perWorker = Math.ceil(botCount / workerCount);

  for (let w = 0; w < workerCount; w++) {
    const from = w * perWorker;
    const count = Math.min(perWorker, botCount - from);
    if (count <= 0) break;
    finished.push(
      new Promise((resolve) => {
        workers.push(
          startWorker({ type: "start", url, runId, pace, rampMs, from, count }, (message) => {
            if (message.type === "progress") latest.set(w, message);
            else {
              merge(message.snapshot);
              resolve();
            }
          }),
        );
      }),
    );
  }

  const startedAt = Date.now();
  const progress = setInterval(async () => {
    const reports = [...latest.values()];
    const sum = (pick: (r: ProgressMessage) => number) => reports.reduce((total, r) => total + pick(r), 0);
    const total = (key: keyof Counters) => sum((r) => r.counters[key]);
    const state = (name: keyof ProgressMessage["states"]) => sum((r) => r.states[name] ?? 0);
    const lag = Math.max(0, ...reports.map((r) => r.lagMs));

    console.log(
      `[${Math.round((Date.now() - startedAt) / 1000)}s] ` +
        `rolling ${state("rolling")}, chatting ${state("chatting")}, idle ${state("idle")}, starting ${state("starting")}  ` +
        `server queue ${await queueSize()}  rolls ${total("rolls")}  matches ${total("matches")}  ` +
        `messages ${total("messagesSent")}  errors ${sum((r) => errorCount(r.errors))}  bot lag ${Math.round(lag)}ms`,
    );
  }, 5_000);

  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    console.log("\nStopping: cancelling searches and leaving chats…");
    workers.forEach((worker) => worker.send({ type: "stop" } satisfies ParentMessage));
  };
  process.once("SIGINT", stop);
  const timer = setTimeout(stop, runMs);

  await Promise.all(finished);
  clearTimeout(timer);
  clearInterval(progress);

  printReport((Date.now() - startedAt) / 1000);
  if (hasError("rate_limited")) {
    console.log("\nRate limited: every bot shares this machine's IP. Set LOADTEST=true on the backend.");
  }
  if (args.cleanup) await deleteBots();
  else console.log("\nBot accounts kept. Delete them with: yarn loadtest --url <url> --cleanup-only");
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
