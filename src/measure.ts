/**
 * One cell for one candidate (docs/adr/0001-what-the-benchmark-answers.md, "Measurement"): a fresh server
 * through the agent, then a capacity search or the slow-client window, with the server's CPU time and memory
 * read around every recorded window.
 */
import type { Stats } from "./agent";
import { type Capacity, findCapacity, HOLD, held, type StepOutcome } from "./capacity";
import { type OhaPass, runOha } from "./oha";
import { HZ } from "./proc";
import { type CapacityCell, connectionsFor, type Protocol, type SlowCell } from "./protocol";

type Json = Record<string, unknown>;

function isJson(v: unknown): v is Json {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function num(o: Json, k: string): number | null {
  const x = o[k];
  return typeof x === "number" ? x : null;
}

function numbers(v: unknown): Record<string, number> {
  if (!isJson(v)) return {};
  return Object.fromEntries(Object.entries(v).flatMap(([k, x]) => (typeof x === "number" ? [[k, x] as const] : [])));
}

/** The agent's /stats answer, field by field. */
export function parseStats(v: unknown): Stats {
  if (!isJson(v)) throw new Error("agent stats is not an object");
  const busy = num(v, "hostBusyTicks");
  const total = num(v, "hostTotalTicks");
  if (busy === null || total === null) throw new Error("agent stats lacks host ticks");
  return { pid: num(v, "pid"), ticks: num(v, "ticks"), rssKb: num(v, "rssKb"), hwmKb: num(v, "hwmKb"), threads: num(v, "threads"), hostBusyTicks: busy, hostTotalTicks: total, nic: numbers(v["nic"]) };
}

export class AgentClient {
  constructor(readonly url: string) {}

  private async call(method: "GET" | "POST", path: string, body?: unknown): Promise<Json> {
    const r = await fetch(`${this.url}${path}`, { method, body: body === undefined ? undefined : JSON.stringify(body), headers: { "content-type": "application/json" }, signal: AbortSignal.timeout(30_000) });
    const data: unknown = await r.json();
    if (!isJson(data)) throw new Error(`agent ${path}: not a JSON object`);
    if (!r.ok) throw new Error(`agent ${path}: ${typeof data["error"] === "string" ? data["error"] : r.status}`);
    return data;
  }

  async start(id: string, env: Record<string, string> = {}): Promise<{ pid: number; banner: string }> {
    const r = await this.call("POST", "/start", { id, env });
    const pid = num(r, "pid");
    if (pid === null) throw new Error(`agent started ${id} without a pid`);
    return { pid, banner: typeof r["banner"] === "string" ? r["banner"] : "" };
  }
  /** The CPUs the agent pins every server to, or null when it pins none. */
  async serverCpus(): Promise<string | null> {
    const r = await this.call("GET", "/health");
    return typeof r["cpus"] === "string" ? r["cpus"] : null;
  }
  async stats(): Promise<Stats> {
    return parseStats(await this.call("GET", "/stats"));
  }
  async stop(): Promise<void> {
    await this.call("POST", "/stop");
  }
  async shape(flowRateMbit: number | null): Promise<string> {
    const r = await this.call("POST", "/shape", { flowRateMbit });
    return typeof r["command"] === "string" ? r["command"] : "";
  }
}

export interface Env {
  agent: AgentClient;
  /** Where the client reaches the server, e.g. http://10.0.0.5:8080. */
  target: string;
  /** Local runs: the client shares the server's host, so the host's other work excludes it too. */
  local: boolean;
  clientCpus?: string;
  clientCores: number;
  /** The client's own NIC, for the slow cell's added round trip on the rig. */
  clientNic: string | null;
  /** oha processes sharing each load (src/oha.ts, `processes`). */
  generators: number;
}

export interface WindowRecord {
  offeredRps: number | null;
  connections: number;
  oha: OhaPass;
  achievedRps: number;
  errorRate: number;
  serverCpuS: number | null;
  usPerResponse: number | null;
  clientCpuS: number;
  clientShare: number;
  clientBound: boolean;
  /** CPUs the server host spent on anything but the server (and, locally, the client) during the window. */
  otherCpus: number | null;
  /** NIC counter deltas over the window. */
  nic: Record<string, number>;
  rssKb: number | null;
}

export interface StepRecord extends StepOutcome {
  window: WindowRecord;
}

/** The commonest transport error of a window, for the progress line. */
export function topError(errors: Record<string, number>): string {
  const top = Object.entries(errors).sort((a, b) => b[1] - a[1])[0];
  return top ? `; ${top[1].toLocaleString("en-US")} × ${top[0].slice(0, 120)}` : "";
}

export function errorRate(p: OhaPass): number {
  const attempted = p.completed + p.transportErrors;
  return attempted === 0 ? 1 : (p.transportErrors + (p.completed - p.success)) / attempted;
}

function delta(a: Record<string, number>, b: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.keys(b).map((k) => [k, (b[k] ?? 0) - (a[k] ?? 0)]));
}

export async function window(env: Env, route: string, connections: number, seconds: number, clientBoundAt: number, rate?: number, timeoutSeconds = 10): Promise<WindowRecord> {
  const s0 = await env.agent.stats();
  const run = await runOha({ url: `${env.target}${route}`, connections, durationSeconds: seconds, rate, timeoutSeconds, cpus: env.clientCpus, processes: env.generators });
  const s1 = await env.agent.stats();
  const p = run.pass;
  const dur = p.durationS > 0 ? p.durationS : seconds;
  const serverCpuS = s0.ticks !== null && s1.ticks !== null ? (s1.ticks - s0.ticks) / HZ : null;
  const hostBusyS = (s1.hostBusyTicks - s0.hostBusyTicks) / HZ;
  const otherCpus = serverCpuS === null ? null : (hostBusyS - serverCpuS - (env.local ? run.clientCpuS : 0)) / dur;
  const clientShare = run.clientCpuS / (dur * env.clientCores);
  return {
    offeredRps: rate ?? null,
    connections,
    oha: p,
    achievedRps: p.success / dur,
    errorRate: errorRate(p),
    serverCpuS,
    usPerResponse: serverCpuS !== null && p.success > 0 ? (serverCpuS * 1e6) / p.success : null,
    clientCpuS: run.clientCpuS,
    clientShare,
    clientBound: clientShare > clientBoundAt,
    otherCpus,
    nic: delta(s0.nic, s1.nic),
    rssKb: s1.rssKb,
  };
}

/**
 * A step that fails only on delivery, with p99 and errors inside the rule, failed for want of requests: under
 * open-loop load with latency correction a server that cannot keep up shows it as latency, so a short count with
 * fast answers means the load generator did not send the offered rate.
 */
export function generatorShortfall(offeredRps: number, w: Pick<WindowRecord, "achievedRps" | "errorRate" | "oha">): boolean {
  return w.achievedRps < HOLD.minDelivered * offeredRps && w.oha.p99Ms !== null && w.oha.p99Ms <= HOLD.p99Ms && w.errorRate <= HOLD.maxErrorRate;
}

export interface CellResult {
  banner: string;
  startRssKb: number | null;
  peakGrowthMb: number | null;
  capacity?: Capacity<StepRecord> & { floor: boolean };
  slow?: WindowRecord;
}

async function peak(env: Env, startRssKb: number | null): Promise<number | null> {
  const s = await env.agent.stats();
  return s.hwmKb !== null && startRssKb !== null ? (s.hwmKb - startRssKb) / 1024 : null;
}

export async function capacityCell(env: Env, id: string, cell: CapacityCell, p: Protocol, beforeWindow: () => Promise<void>): Promise<CellResult> {
  const started = await env.agent.start(id);
  try {
    const startRssKb = (await env.agent.stats()).rssKb;
    const result = await findCapacity<StepRecord>(async (rps) => {
      const connections = connectionsFor(rps);
      await runOha({ url: `${env.target}${cell.route}`, connections, durationSeconds: p.warmupS, rate: rps, timeoutSeconds: 10, cpus: env.clientCpus, processes: env.generators });
      await beforeWindow();
      const w = await window(env, cell.route, connections, p.stepS, p.clientBoundAt, rps);
      const ok = held(rps, w.achievedRps, w.oha.p99Ms, w.errorRate, HOLD);
      if (!ok && generatorShortfall(rps, w)) w.clientBound = true;
      console.log(`    ${id} ${cell.id} ${rps.toLocaleString("en-US")}/s: ${ok ? "held" : "failed"} at ${Math.round(w.achievedRps).toLocaleString("en-US")}/s, p99 ${w.oha.p99Ms ?? "–"} ms, errors ${(w.errorRate * 100).toFixed(2)}%, ${w.usPerResponse?.toFixed(1) ?? "–"} µs/response, client ${(w.clientShare * 100).toFixed(0)}%${w.otherCpus !== null && w.otherCpus > 0.5 ? `, other work ${w.otherCpus.toFixed(1)} CPUs` : ""}${topError(w.oha.errors)}`);
      return { offeredRps: rps, achievedRps: w.achievedRps, p99Ms: w.oha.p99Ms, errorRate: w.errorRate, held: ok, window: w };
    }, cell.search);
    const floor = result.steps.some((s) => !s.held && s.window.clientBound);
    return { banner: started.banner, startRssKb, peakGrowthMb: await peak(env, startRssKb), capacity: { ...result, floor } };
  } finally {
    await env.agent.stop();
  }
}

/**
 * The client's added round trip for the slow cell. netem queues every delayed packet, and its default limit of
 * 1,000 packets would drop the ACKs of 1,000 connections 40 ms deep, so the limit is raised well past that.
 */
export function netemCommand(nic: string, rttMs: number | null): string[] {
  return rttMs === null ? ["tc", "qdisc", "del", "dev", nic, "root"] : ["tc", "qdisc", "replace", "dev", nic, "root", "netem", "delay", `${rttMs}ms`, "limit", "100000"];
}

function netem(nic: string, rttMs: number | null): void {
  const cmd = netemCommand(nic, rttMs);
  const r = Bun.spawnSync({ cmd, stdout: "pipe", stderr: "pipe" });
  if (r.exitCode !== 0 && rttMs !== null) throw new Error(`${cmd.join(" ")}: ${r.stderr.toString().trim()}`);
}

export async function slowCell(env: Env, id: string, cell: SlowCell, p: Protocol, beforeWindow: () => Promise<void>): Promise<CellResult> {
  const shaped = !env.local;
  if (shaped) {
    if (!env.clientNic) throw new Error("the slow cell on the rig needs the client's NIC (--nic)");
    await env.agent.shape(cell.flowRateMbit);
    netem(env.clientNic, cell.rttMs);
  }
  try {
    const started = await env.agent.start(id, env.local ? { SNDBUF: String(cell.localSndbuf) } : {});
    try {
      const startRssKb = (await env.agent.stats()).rssKb;
      await runOha({ url: `${env.target}${cell.route}`, connections: cell.connections, durationSeconds: p.slowWarmupS, timeoutSeconds: 60, cpus: env.clientCpus, processes: env.generators });
      await beforeWindow();
      const w = await window(env, cell.route, cell.connections, p.slowWindowS, p.clientBoundAt, undefined, 60);
      const growth = await peak(env, startRssKb);
      console.log(`    ${id} ${cell.id}: ${Math.round(w.achievedRps).toLocaleString("en-US")}/s, p50 ${w.oha.p50Ms} ms, p99 ${w.oha.p99Ms} ms, ${w.usPerResponse?.toFixed(1) ?? "–"} µs/response, peak growth ${growth?.toFixed(1) ?? "–"} MB, errors ${(w.errorRate * 100).toFixed(2)}%`);
      return { banner: started.banner, startRssKb, peakGrowthMb: growth, slow: w };
    } finally {
      await env.agent.stop();
    }
  } finally {
    if (shaped && env.clientNic) {
      await env.agent.shape(null);
      netem(env.clientNic, null);
    }
  }
}
