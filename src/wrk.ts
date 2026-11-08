/**
 * The Proof bot's load generator: wrk 4.1.0, closed loop, which the agent runs on the server instance itself for
 * the proof cells (docs/adr/0001-what-the-benchmark-answers.md, "Cells").
 */
import type { OhaPass } from "./oha";

export interface WrkOptions {
  url: string;
  connections: number;
  threads: number;
  durationSeconds: number;
  /** The CPUs wrk may use (taskset list). */
  cpus: string;
  timeoutSeconds: number;
}

export function wrkArgs(o: WrkOptions): string[] {
  return ["taskset", "-c", o.cpus, "wrk", "--latency", "-t", String(o.threads), "-c", String(o.connections), "-d", `${o.durationSeconds}s`, "--timeout", `${o.timeoutSeconds}s`, o.url];
}

const MS_PER: Record<string, number> = { us: 1e-3, ms: 1, s: 1e3, m: 6e4 };

/** One of wrk's durations ("812.50us", "1.77ms", "8.00s") in milliseconds. */
export function wrkDuration(text: string): number | null {
  const m = /^([\d.]+)(us|ms|s|m)$/.exec(text);
  const unit = m?.[2] === undefined ? undefined : MS_PER[m[2]];
  return m && unit !== undefined ? Number(m[1]) * unit : null;
}

/**
 * wrk's report as the counts and percentiles every window keeps. wrk counts every response it read, so the
 * successes are those less its non-2xx or 3xx count; its socket errors are the transport errors; `--latency`
 * prints the 50th, 75th, 90th and 99th percentiles.
 */
export function parseWrk(text: string): OhaPass {
  const total = /(\d+) requests in ([\d.]+(?:us|ms|s|m)),/.exec(text);
  if (!total?.[1] || !total[2]) throw new Error(`wrk printed no request count: ${text.slice(0, 300)}`);
  const completed = Number(total[1]);
  const durationMs = wrkDuration(total[2]);
  const pct = (p: string) => {
    const m = new RegExp(`^\\s+${p}%\\s+([\\d.]+(?:us|ms|s|m))\\s*$`, "m").exec(text);
    return m?.[1] ? wrkDuration(m[1]) : null;
  };
  const sock = /Socket errors: connect (\d+), read (\d+), write (\d+), timeout (\d+)/.exec(text);
  const errors: Record<string, number> = sock ? { connect: Number(sock[1]), read: Number(sock[2]), write: Number(sock[3]), timeout: Number(sock[4]) } : {};
  const non2xx = Number(/Non-2xx or 3xx responses: (\d+)/.exec(text)?.[1] ?? 0);
  const max = /^\s+Latency\s+\S+\s+\S+\s+(\S+)/m.exec(text);
  return {
    completed,
    success: completed - non2xx,
    transportErrors: Object.values(errors).reduce((a, b) => a + b, 0),
    abortedAtDeadline: 0,
    statusCodes: {},
    errors: Object.fromEntries(Object.entries(errors).filter(([, n]) => n > 0)),
    p50Ms: pct("50"),
    p90Ms: pct("90"),
    p99Ms: pct("99"),
    p999Ms: null,
    maxMs: max?.[1] ? wrkDuration(max[1]) : null,
    durationS: durationMs === null ? 0 : durationMs / 1e3,
    bytesPerResponse: null,
  };
}

/** The CPU count of a taskset list such as "4-7" or "4,6,8-11". */
export function cpuCount(list: string): number {
  return list.split(",").reduce((n, part) => {
    const [a, b] = part.split("-").map(Number);
    return n + (b === undefined ? 1 : b - (a ?? b) + 1);
  }, 0);
}

/** The first `n` CPUs of a taskset list, as a list again: locally, a proof cell's share of the runner's CPUs. */
export function firstCpus(list: string, n: number): string {
  const cpus = list.split(",").flatMap((part) => {
    const [a, b] = part.split("-").map(Number);
    const lo = a ?? 0;
    return Array.from({ length: b === undefined ? 1 : b - lo + 1 }, (_, i) => lo + i);
  });
  return cpus.slice(0, n).join(",");
}
