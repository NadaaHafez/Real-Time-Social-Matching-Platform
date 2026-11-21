import { parseArgs } from "node:util";

import type { QueueStats } from "@social-matching/shared";

import { request } from "./api";
import { Bot, type BotState } from "./bot";
import { counters, errorCount, hasError, printReport } from "./stats";

const { values: args } = parseArgs({
  options: {
    url: { type: "string", default: "http://localhost:8000" },
    bots: { type: "string", default: "50" },
    minutes: { type: "string", default: "2" },
    ramp: { type: "string", default: "30" },
    pace: { type: "string", default: "1" },
    cleanup: { type: "boolean", default: false },
    "cleanup-only": { type: "boolean", default: false },
  },
});

const url = args.url.replace(/\/$/, "");
const botCount = Number(args.bots);
const runMs = Number(args.minutes) * 60_000;
const rampMs = Number(args.ramp) * 1_000;
const pace = Number(args.pace);

async function deleteBots(): Promise<void> {
  const { deleted } = await request<{ deleted: number }>(url, "DELETE", "/dev/bots");
  console.log(`Deleted ${deleted} bot accounts.`);
}

async function main(): Promise<void> {
  if (args["cleanup-only"]) return deleteBots();

  // Unique per run, so each run starts with fresh accounts. Fits the 30-char username limit.
  const runId = Date.now().toString(36).slice(-5);
  console.log(`${botCount} bots → ${url} for ${args.minutes} min (ramp ${args.ramp}s, pace ${pace}). Ctrl+C stops early.\n`);

  const bots: Bot[] = [];
  const runs: Promise<void>[] = [];
  const startedAt = Date.now();
  let stopping = false;
  let markStopped = () => {};
  const stopped = new Promise<void>((resolve) => (markStopped = resolve));

  const stop = () => {
    if (stopping) return;
    stopping = true;
    markStopped();
    console.log("\nStopping: cancelling searches and leaving chats…");
    bots.forEach((bot) => bot.stop());
  };
  process.once("SIGINT", stop);
  const timer = setTimeout(stop, runMs);

  // Bots join gradually, like people opening the app, not all in the same millisecond.
  const ramp = (async () => {
    for (let i = 0; i < botCount && !stopping; i++) {
      const bot = new Bot({ url, username: `bot_${runId}_${i}`, pace });
      bots.push(bot);
      runs.push(bot.run());
      await new Promise((resolve) => setTimeout(resolve, rampMs / botCount));
    }
  })();

  const progress = setInterval(async () => {
    const states: Partial<Record<BotState, number>> = {};
    bots.forEach((bot) => (states[bot.state] = (states[bot.state] ?? 0) + 1));

    // What the server thinks is waiting, asked by any signed-in bot.
    let waiting = "?";
    const token = bots.find((bot) => bot.accessToken)?.accessToken;
    if (token) {
      waiting = await request<QueueStats>(url, "GET", "/matchmaking/queue", { token }).then(
        (q) => String(q.waiting),
        () => "?",
      );
    }

    const elapsed = Math.round((Date.now() - startedAt) / 1000);
    console.log(
      `[${elapsed}s] bots ${bots.length} (rolling ${states.rolling ?? 0}, chatting ${states.chatting ?? 0}, ` +
        `idle ${states.idle ?? 0}, starting ${states.starting ?? 0})  server queue ${waiting}  ` +
        `rolls ${counters.rolls}  matches ${counters.matches}  messages ${counters.messagesSent}  errors ${errorCount()}`,
    );
  }, 5_000);

  await ramp;
  await stopped;
  await Promise.all(runs);
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
