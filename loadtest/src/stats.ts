/** Counters and latency samples for this process. Workers send theirs to the parent, which merges them. */

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
export type Counters = typeof counters;

const samples = new Map<string, number[]>();
const errors = new Map<string, number>();

export type Snapshot = {
  counters: Counters;
  samples: Record<string, number[]>;
  errors: Record<string, number>;
};

export function record(name: string, ms: number): void {
  let list = samples.get(name);
  if (!list) samples.set(name, (list = []));
  list.push(ms);
}

export function recordError(code: string): void {
  errors.set(code, (errors.get(code) ?? 0) + 1);
}

export function errorCount(errorMap: Record<string, number> = Object.fromEntries(errors)): number {
  return Object.values(errorMap).reduce((sum, n) => sum + n, 0);
}

export function hasError(fragment: string): boolean {
  return [...errors.keys()].some((code) => code.includes(fragment));
}

export function snapshot(withSamples: boolean): Snapshot {
  return {
    counters: { ...counters },
    samples: withSamples ? Object.fromEntries(samples) : {},
    errors: Object.fromEntries(errors),
  };
}

/** Adds a worker's final numbers to this process's. */
export function merge(other: Snapshot): void {
  for (const key of Object.keys(counters) as (keyof Counters)[]) counters[key] += other.counters[key];
  for (const [name, list] of Object.entries(other.samples)) for (const ms of list) record(name, ms);
  for (const [code, n] of Object.entries(other.errors)) errors.set(code, (errors.get(code) ?? 0) + n);
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
