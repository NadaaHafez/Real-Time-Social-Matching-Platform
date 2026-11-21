import { monitorEventLoopDelay } from "node:perf_hooks";

import { Bot, type BotState } from "./bot";
import { snapshot, type Counters } from "./stats";

/** One child process running a slice of the bots. The parent (index.ts) starts, stops and aggregates. */

export type StartMessage = {
  type: "start";
  url: string;
  runId: string;
  pace: number;
  rampMs: number;
  /** Bot numbers [from, from + count). */
  from: number;
  count: number;
};
export type ParentMessage = StartMessage | { type: "stop" };

export type ProgressMessage = {
  type: "progress";
  states: Partial<Record<BotState, number>>;
  counters: Counters;
  errors: Record<string, number>;
  /** p99 event-loop delay since the last report. High means this worker, not the server, is slow. */
  lagMs: number;
};
export type WorkerMessage = ProgressMessage | { type: "done"; snapshot: ReturnType<typeof snapshot> };

const send = (message: WorkerMessage) => process.send!(message);

const bots: Bot[] = [];
const runs: Promise<void>[] = [];
let stopping = false;

const lag = monitorEventLoopDelay({ resolution: 20 });
lag.enable();

const progress = setInterval(() => {
  const states: ProgressMessage["states"] = {};
  bots.forEach((bot) => (states[bot.state] = (states[bot.state] ?? 0) + 1));
  const { counters, errors } = snapshot(false);
  send({ type: "progress", states, counters, errors, lagMs: lag.percentile(99) / 1e6 });
  lag.reset();
}, 2_000);

async function start(config: StartMessage): Promise<void> {
  // Bots join gradually, like people opening the app.
  for (let i = 0; i < config.count && !stopping; i++) {
    const bot = new Bot({ url: config.url, username: `bot_${config.runId}_${config.from + i}`, pace: config.pace });
    bots.push(bot);
    runs.push(bot.run());
    await new Promise((resolve) => setTimeout(resolve, config.rampMs / config.count));
  }
}

async function stop(): Promise<void> {
  stopping = true;
  bots.forEach((bot) => bot.stop());
  await Promise.all(runs);
  clearInterval(progress);
  send({ type: "done", snapshot: snapshot(true) });
  process.disconnect();
}

process.on("message", (message: ParentMessage) => {
  if (message.type === "start") void start(message);
  else void stop();
});

// Ctrl+C reaches every process in the terminal; only the parent decides when to stop.
process.on("SIGINT", () => undefined);
