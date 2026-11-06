/** The load generator: oha 1.16.0, closed loop or open loop with its coordinated-omission correction. */

/** What oha reports for one invocation, in milliseconds and counts. */
export interface OhaPass {
  /** Responses with any status. */
  completed: number;
  success: number;
  /** Connection errors and timeouts; requests oha cut off when the pass ended are not errors. */
  transportErrors: number;
  abortedAtDeadline: number;
  statusCodes: Record<string, number>;
  /** Transport errors by oha's description, deadline aborts left out. */
  errors: Record<string, number>;
  p50Ms: number | null;
  p90Ms: number | null;
  p99Ms: number | null;
  p999Ms: number | null;
  maxMs: number | null;
  durationS: number;
  bytesPerResponse: number | null;
}

/** oha's label for requests still in flight when a `-z` pass ends. */
export const OHA_DEADLINE_ABORT = "aborted due to deadline";

interface OhaJson {
  summary: { total: number; slowest?: number | null; sizePerRequest?: number | null };
  latencyPercentiles?: Record<string, number | null>;
  statusCodeDistribution?: Record<string, number>;
  errorDistribution?: Record<string, number>;
}

function isOhaJson(v: unknown): v is OhaJson {
  return typeof v === "object" && v !== null && "summary" in v && typeof v.summary === "object" && v.summary !== null && "total" in v.summary && typeof v.summary.total === "number";
}

const finite = (v: number | null | undefined): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

export function parseOha(text: string): OhaPass {
  const data: unknown = JSON.parse(text);
  if (!isOhaJson(data)) throw new Error("oha output has no summary");
  const statusCodes = data.statusCodeDistribution ?? {};
  const errors = data.errorDistribution ?? {};
  const completed = Object.values(statusCodes).reduce((a, b) => a + b, 0);
  const success = Object.entries(statusCodes).reduce((sum, [code, n]) => (code.startsWith("2") ? sum + n : sum), 0);
  const abortedAtDeadline = errors[OHA_DEADLINE_ABORT] ?? 0;
  const transportErrors = Object.entries(errors).reduce((sum, [kind, n]) => (kind === OHA_DEADLINE_ABORT ? sum : sum + n), 0);
  const ms = (v: number | null) => (v === null || completed === 0 ? null : Math.round(v * 1e6) / 1e3);
  const pct = (key: string) => ms(finite(data.latencyPercentiles?.[key]));
  return {
    completed,
    success,
    transportErrors,
    abortedAtDeadline,
    statusCodes,
    errors: Object.fromEntries(Object.entries(errors).filter(([kind]) => kind !== OHA_DEADLINE_ABORT)),
    p50Ms: pct("p50"),
    p90Ms: pct("p90"),
    p99Ms: pct("p99"),
    p999Ms: pct("p99.9"),
    maxMs: ms(finite(data.summary.slowest)),
    durationS: data.summary.total,
    bytesPerResponse: finite(data.summary.sizePerRequest),
  };
}

export interface OhaOptions {
  url: string;
  connections: number;
  durationSeconds: number;
  /** Open loop: offered requests per second, latency measured from each request's scheduled start. */
  rate?: number;
  timeoutSeconds: number;
  /** Local runs: the CPUs oha may use (taskset list). */
  cpus?: string;
  /**
   * How many oha processes share the load. One oha schedules an open-loop rate from a single limiter, which
   * on an 8-core Linux workstation stopped near 165K requests/s with its CPUs half idle, so the rate and the
   * connections are split.
   */
  processes?: number;
}

export function ohaArgs(o: OhaOptions): string[] {
  const args = ["oha", "--no-tui", "--output-format", "json", "--disable-compression", "-t", `${o.timeoutSeconds}s`, "-c", String(o.connections), "-z", `${o.durationSeconds}s`];
  if (o.rate !== undefined) args.push("-q", String(o.rate), "--latency-correction");
  args.push(o.url);
  return o.cpus ? ["taskset", "-c", o.cpus, ...args] : args;
}

/** One process's share: the rate split evenly, the connections split with at least 8 each. */
export function shares(o: OhaOptions): OhaOptions[] {
  const k = Math.max(1, Math.min(o.processes ?? 1, Math.floor(o.connections / 8)));
  return Array.from({ length: k }, () => ({ ...o, processes: 1, connections: Math.ceil(o.connections / k), rate: o.rate === undefined ? undefined : Math.ceil(o.rate / k) }));
}

/**
 * Several processes' results as one: counts add up, and each percentile is the highest any process saw. With
 * equal shares the pooled percentile lies between the processes' own, so the highest is a bound the hold rule
 * can rely on.
 */
export function mergePasses(passes: readonly OhaPass[]): OhaPass {
  const first = passes[0];
  if (!first) throw new Error("no oha passes to merge");
  if (passes.length === 1) return first;
  const sum = (f: (p: OhaPass) => number) => passes.reduce((a, p) => a + f(p), 0);
  const worst = (f: (p: OhaPass) => number | null) => {
    const v = passes.map(f).filter((x): x is number => x !== null);
    return v.length === 0 ? null : Math.max(...v);
  };
  const statusCodes: Record<string, number> = {};
  for (const p of passes) for (const [code, n] of Object.entries(p.statusCodes)) statusCodes[code] = (statusCodes[code] ?? 0) + n;
  const errors: Record<string, number> = {};
  for (const p of passes) for (const [kind, n] of Object.entries(p.errors)) errors[kind] = (errors[kind] ?? 0) + n;
  return {
    completed: sum((p) => p.completed),
    success: sum((p) => p.success),
    transportErrors: sum((p) => p.transportErrors),
    abortedAtDeadline: sum((p) => p.abortedAtDeadline),
    statusCodes,
    errors,
    p50Ms: worst((p) => p.p50Ms),
    p90Ms: worst((p) => p.p90Ms),
    p99Ms: worst((p) => p.p99Ms),
    p999Ms: worst((p) => p.p999Ms),
    maxMs: worst((p) => p.maxMs),
    durationS: Math.max(...passes.map((p) => p.durationS)),
    bytesPerResponse: first.bytesPerResponse,
  };
}

export interface OhaRun {
  pass: OhaPass;
  /** oha's own user plus system time, every process. */
  clientCpuS: number;
  processes: number;
}

export async function runOha(o: OhaOptions): Promise<OhaRun> {
  const parts = shares(o);
  const procs = parts.map((part) => Bun.spawn({ cmd: ohaArgs(part), stdout: "pipe", stderr: "pipe", timeout: (o.durationSeconds + o.timeoutSeconds + 30) * 1000 }));
  const outs = await Promise.all(
    procs.map(async (p) => {
      const [out, err, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
      if (code !== 0) throw new Error(`oha exited ${code}: ${err.slice(0, 400)}`);
      const cpu = p.resourceUsage()?.cpuTime;
      return { pass: parseOha(out), cpuS: cpu ? Number(cpu.user + cpu.system) / 1e6 : Number.NaN };
    }),
  );
  return { pass: mergePasses(outs.map((x) => x.pass)), clientCpuS: outs.reduce((a, x) => a + x.cpuS, 0), processes: parts.length };
}
