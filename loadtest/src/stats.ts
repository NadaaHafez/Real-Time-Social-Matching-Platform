/** Counters and latency samples shared by every bot in this process. */

export const counters = {
  signIns: 0,
  rolls: 0,
  matches: 0,
  expired: 0,
  messagesSent: 0,
  messagesReceived: 0,
  sessionsEnded: 0,
  /** Sent into a chat the partner had just left. */
  races: 0,
};

const samples = new Map<string, number[]>();
const errors = new Map<string, number>();

export function record(name: string, ms: number): void {
  let list = samples.get(name);
  if (!list) samples.set(name, (list = []));
  list.push(ms);
}

export function recordError(code: string): void {
  errors.set(code, (errors.get(code) ?? 0) + 1);
}

export function errorCount(): number {
  let total = 0;
  for (const n of errors.values()) total += n;
  return total;
}

export function hasError(fragment: string): boolean {
  return [...errors.keys()].some((code) => code.includes(fragment));
}

function percentile(sorted: number[], p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

export function printReport(seconds: number): void {
  const rate = (n: number) => (n / seconds).toFixed(1);

  console.log(`\n=== Report (${seconds.toFixed(0)}s) ===`);
  console.log(
    `rolls ${counters.rolls} (${rate(counters.rolls)}/s)  matches ${counters.matches}  expired ${counters.expired}  ` +
      `messages sent ${counters.messagesSent} (${rate(counters.messagesSent)}/s)  received ${counters.messagesReceived}  ` +
      `sessions ended ${counters.sessionsEnded}  leave/message races ${counters.races}`,
  );

  const rows = [...samples.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, list]) => {
      const sorted = [...list].sort((a, b) => a - b);
      return {
        metric: name,
        count: sorted.length,
        p50: Math.round(percentile(sorted, 50)),
        p95: Math.round(percentile(sorted, 95)),
        p99: Math.round(percentile(sorted, 99)),
        max: Math.round(sorted[sorted.length - 1]),
      };
    });
  console.log("\nLatency (ms)");
  console.table(rows);

  if (errors.size === 0) {
    console.log("No errors.");
  } else {
    console.log("Errors");
    console.table([...errors.entries()].sort(([, a], [, b]) => b - a).map(([code, count]) => ({ code, count })));
  }
}
