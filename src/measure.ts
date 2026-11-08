/**
 * One cell for one candidate (docs/adr/0001-what-the-benchmark-answers.md, "Measurement"): a fresh server
 * through the agent, then a capacity search or the slow-client window, with the server's CPU time and memory
 * read around every recorded window.
 */
import type { LoopbackRequest, LoopbackResult, Stats } from "./agent";
import { type Capacity, findCapacity, HOLD, held, type StepOutcome } from "./capacity";
import { type OhaPass, runOha } from "./oha";
import { HZ } from "./proc";
import { type BulkCell, type CapacityCell, connectionsFor, type ProofCell, type Protocol, type SlowCell } from "./protocol";
import { cpuCount, firstCpus } from "./wrk";

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

/** A load generator's pass as the agent sends it (the proof cells' wrk), field by field. */
export function parsePass(v: unknown): OhaPass {
  if (!isJson(v)) throw new Error("agent pass is not an object");
  const need = (k: string) => {
    const x = num(v, k);
    if (x === null) throw new Error(`agent pass lacks ${k}`);
    return x;
  };
  return {
    completed: need("completed"),
    success: need("success"),
    transportErrors: need("transportErrors"),
    abortedAtDeadline: need("abortedAtDeadline"),
    statusCodes: numbers(v["statusCodes"]),
    errors: numbers(v["errors"]),
    p50Ms: num(v, "p50Ms"),
    p90Ms: num(v, "p90Ms"),
    p99Ms: num(v, "p99Ms"),
    p999Ms: num(v, "p999Ms"),
    maxMs: num(v, "maxMs"),
    durationS: need("durationS"),
    bytesPerResponse: num(v, "bytesPerResponse"),
  };
}

export class AgentClient {
  constructor(readonly url: string) {}

  private async call(method: "GET" | "POST", path: string, body?: unknown, timeoutMs = 30_000): Promise<Json> {
    const r = await fetch(`${this.url}${path}`, { method, body: body === undefined ? undefined : JSON.stringify(body), headers: { "content-type": "application/json" }, signal: AbortSignal.timeout(timeoutMs) });
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
  /** The runtimes the agent's host has for the servers outside Rust, by name. */
  async runtimes(): Promise<Record<string, string>> {
    const r = await this.call("GET", "/health");
    const v = r["runtimes"];
    return isJson(v) ? Object.fromEntries(Object.entries(v).flatMap(([k, x]) => (typeof x === "string" ? [[k, x] as const] : []))) : {};
  }
  /** The version of the wrk the agent runs for the proof cells, or null when it has none. */
  async wrkVersion(): Promise<string | null> {
    const r = await this.call("GET", "/health");
    return typeof r["wrk"] === "string" ? r["wrk"] : null;
  }
  /** wrk against the running server, on the agent's host: one proof window. */
  async loopback(req: LoopbackRequest): Promise<LoopbackResult> {
    const r = await this.call("POST", "/loopback", req, (req.seconds + 45) * 1000);
    return { pass: parsePass(r["pass"]), cpuS: num(r, "cpuS") ?? Number.NaN, command: typeof r["command"] === "string" ? r["command"] : "" };
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
  bulk?: WindowRecord;
  /** A proof cell's window: wrk's pass in place of oha's, its CPU as the client's. */
  proof?: WindowRecord;
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

/** A fresh server under `connections` keep-alive clients fetching `route` back to back: a warm-up, then one recorded window. */
async function closedLoop(env: Env, id: string, route: string, connections: number, p: Protocol, beforeWindow: () => Promise<void>, serverEnv: Record<string, string>): Promise<Omit<CellResult, "capacity" | "slow" | "bulk"> & { window: WindowRecord }> {
  const started = await env.agent.start(id, serverEnv);
  try {
    const startRssKb = (await env.agent.stats()).rssKb;
    await runOha({ url: `${env.target}${route}`, connections, durationSeconds: p.slowWarmupS, timeoutSeconds: 60, cpus: env.clientCpus, processes: env.generators });
    await beforeWindow();
    const w = await window(env, route, connections, p.slowWindowS, p.clientBoundAt, undefined, 60);
    return { banner: started.banner, startRssKb, peakGrowthMb: await peak(env, startRssKb), window: w };
  } finally {
    await env.agent.stop();
  }
}

export async function slowCell(env: Env, id: string, cell: SlowCell, p: Protocol, beforeWindow: () => Promise<void>): Promise<CellResult> {
  const shaped = !env.local;
  if (shaped) {
    if (!env.clientNic) throw new Error("the slow cell on the rig needs the client's NIC (--nic)");
    await env.agent.shape(cell.flowRateMbit);
    netem(env.clientNic, cell.rttMs);
  }
  try {
    const { window: w, ...r } = await closedLoop(env, id, cell.route, cell.connections, p, beforeWindow, env.local ? { SNDBUF: String(cell.localSndbuf) } : {});
    console.log(`    ${id} ${cell.id}: ${Math.round(w.achievedRps).toLocaleString("en-US")}/s, p50 ${w.oha.p50Ms} ms, p99 ${w.oha.p99Ms} ms, ${w.usPerResponse?.toFixed(1) ?? "–"} µs/response, peak growth ${r.peakGrowthMb?.toFixed(1) ?? "–"} MB, errors ${(w.errorRate * 100).toFixed(2)}%${topError(w.oha.errors)}`);
    return { ...r, slow: w };
  } finally {
    if (shaped && env.clientNic) {
      await env.agent.shape(null);
      netem(env.clientNic, null);
    }
  }
}

/** A window's delivered throughput in Gbit/s, counting completed responses only. */
export function gbitPerS(w: Pick<WindowRecord, "achievedRps">, bytes: number): number {
  return (w.achievedRps * bytes * 8) / 1e9;
}

/** The bulk cell: the same closed loop with nothing shaped, on the rig and locally alike. */
export async function bulkCell(env: Env, id: string, cell: BulkCell, p: Protocol, beforeWindow: () => Promise<void>): Promise<CellResult> {
  const { window: w, ...r } = await closedLoop(env, id, cell.route, cell.connections, p, beforeWindow, {});
  console.log(`    ${id} ${cell.id}: ${gbitPerS(w, cell.bytes).toFixed(2)} Gbit/s (${w.achievedRps.toFixed(1)}/s), p50 ${w.oha.p50Ms} ms, p99 ${w.oha.p99Ms} ms, ${w.usPerResponse?.toFixed(0) ?? "–"} µs/response, client ${(w.clientShare * 100).toFixed(0)}%, peak growth ${r.peakGrowthMb?.toFixed(1) ?? "–"} MB, errors ${(w.errorRate * 100).toFixed(2)}%${topError(w.oha.errors)}`);
  return { ...r, bulk: w };
}

/**
 * A proof cell: the Proof bot's wrk over loopback on the server instance, after a warm-up, with the server's
 * CPU time and memory read around the recorded window. wrk shares the host with the server, so the host's other
 * work leaves both out.
 */
export async function proofCell(env: Env, id: string, cell: ProofCell, p: Protocol, beforeWindow: () => Promise<void>): Promise<CellResult> {
  // locally the server and the runner already split the host's CPUs: wrk takes as many of the runner's
  const cpus = env.local && env.clientCpus ? firstCpus(env.clientCpus, cpuCount(cell.cpus)) : cell.cpus;
  const threads = Math.min(cell.threads, cpuCount(cpus));
  const started = await env.agent.start(id, cell.sndbuf === null ? {} : { SNDBUF: String(cell.sndbuf) });
  try {
    const startRssKb = (await env.agent.stats()).rssKb;
    const req = { route: cell.route, connections: cell.connections, threads, cpus };
    await env.agent.loopback({ ...req, seconds: p.proofWarmupS });
    await beforeWindow();
    const s0 = await env.agent.stats();
    const run = await env.agent.loopback({ ...req, seconds: p.proofWindowS });
    const s1 = await env.agent.stats();
    const pass = run.pass;
    const dur = pass.durationS > 0 ? pass.durationS : p.proofWindowS;
    const serverCpuS = s0.ticks !== null && s1.ticks !== null ? (s1.ticks - s0.ticks) / HZ : null;
    const hostBusyS = (s1.hostBusyTicks - s0.hostBusyTicks) / HZ;
    const clientShare = run.cpuS / (dur * cpuCount(cpus));
    const w: WindowRecord = {
      offeredRps: null,
      connections: cell.connections,
      oha: pass,
      achievedRps: pass.success / dur,
      errorRate: errorRate(pass),
      serverCpuS,
      usPerResponse: serverCpuS !== null && pass.success > 0 ? (serverCpuS * 1e6) / pass.success : null,
      clientCpuS: run.cpuS,
      clientShare,
      clientBound: clientShare > p.clientBoundAt,
      otherCpus: serverCpuS === null ? null : (hostBusyS - serverCpuS - run.cpuS) / dur,
      nic: delta(s0.nic, s1.nic),
      rssKb: s1.rssKb,
    };
    const peakGrowthMb = await peak(env, startRssKb);
    console.log(`    ${id} ${cell.id}: ${Math.round(w.achievedRps).toLocaleString("en-US")}/s, p50 ${pass.p50Ms?.toFixed(2) ?? "–"} ms, p99 ${pass.p99Ms?.toFixed(2) ?? "–"} ms, ${w.usPerResponse?.toFixed(1) ?? "–"} µs/response, wrk ${(clientShare * 100).toFixed(0)}% of ${cpuCount(cpus)} CPUs, peak growth ${peakGrowthMb?.toFixed(1) ?? "–"} MB, errors ${(w.errorRate * 100).toFixed(2)}%${topError(pass.errors)}`);
    return { banner: started.banner, startRssKb, peakGrowthMb, proof: w };
  } finally {
    await env.agent.stop();
  }
}
