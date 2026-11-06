/**
 * The server instance's agent (docs/adr/0001-what-the-benchmark-answers.md, "Measurement"): runs one
 * candidate's server at a time, reports its CPU time and memory from /proc and the NIC's counters, and on the
 * rig paces every outgoing flow for the slow-client cell. It starts only binaries in --bin-dir.
 *   bun run src/agent.ts --bin-dir=build/bin [--port=9000] [--nic=auto|none|<iface>] [--cpus=0-7] [--server-port=8080]
 */
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { arg, numberArg } from "./cli";
import { hostTicks, nicCounters, processMemory, processTicks, resolveNic } from "./proc";

export interface StartRequest {
  id: string;
  env?: Record<string, string>;
}

export interface Stats {
  pid: number | null;
  ticks: number | null;
  rssKb: number | null;
  hwmKb: number | null;
  threads: number | null;
  hostBusyTicks: number;
  hostTotalTicks: number;
  nic: Record<string, number>;
}

export const ID_PATTERN = /^[a-z0-9][a-z0-9.\-]*$/;
/** Environment a start may set: the listener's send buffer (local slow clients) and nothing else. */
export const ALLOWED_ENV = new Set(["SNDBUF"]);

export function startRequest(body: unknown): StartRequest {
  if (typeof body !== "object" || body === null || !("id" in body) || typeof body.id !== "string" || !ID_PATTERN.test(body.id)) throw new Error("start needs an id of lowercase letters, digits, dots and dashes");
  const env: Record<string, string> = {};
  if ("env" in body && body.env !== undefined) {
    if (typeof body.env !== "object" || body.env === null) throw new Error("env must be an object");
    for (const [k, v] of Object.entries(body.env)) {
      if (!ALLOWED_ENV.has(k) || typeof v !== "string" || !/^\d+$/.test(v)) throw new Error(`env ${k} is not allowed`);
      env[k] = v;
    }
  }
  return { id: body.id, env };
}

/** The tc command that paces every flow at `mbit`, or restores the interface's default qdisc. */
export function shapeCommand(nic: string, mbit: number | null): string[] {
  return mbit === null ? ["tc", "qdisc", "del", "dev", nic, "root"] : ["tc", "qdisc", "replace", "dev", nic, "root", "fq", "maxrate", `${mbit}mbit`];
}

class Agent {
  private server: ReturnType<typeof Bun.spawn> | null = null;
  private banner = "";

  constructor(
    private readonly binDir: string,
    private readonly serverPort: number,
    private readonly nic: string | null,
    private readonly cpus: string | null,
  ) {}

  stats(): Stats {
    const pid = this.server?.pid ?? null;
    const mem = pid === null ? null : processMemory(pid);
    const host = hostTicks();
    return { pid, ticks: pid === null ? null : processTicks(pid), rssKb: mem?.rssKb ?? null, hwmKb: mem?.hwmKb ?? null, threads: mem?.threads ?? null, hostBusyTicks: host.busy, hostTotalTicks: host.total, nic: nicCounters(this.nic) };
  }

  async start(req: StartRequest): Promise<{ pid: number; banner: string }> {
    if (this.server) await this.stop();
    const bin = join(this.binDir, req.id);
    if (!existsSync(bin)) throw new Error(`no binary ${req.id} in ${this.binDir}`);
    const cmd = this.cpus ? ["taskset", "-c", this.cpus, bin] : [bin];
    const proc = Bun.spawn({ cmd, env: { PATH: process.env["PATH"] ?? "/usr/bin:/bin", ADDR: `0.0.0.0:${this.serverPort}`, ...req.env }, stdout: "ignore", stderr: "pipe" });
    this.server = proc;
    this.banner = "";
    void this.drain(proc.stderr);
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      if (proc.exitCode !== null) throw new Error(`${req.id} exited ${proc.exitCode}: ${this.banner}`);
      try {
        const r = await fetch(`http://127.0.0.1:${this.serverPort}/json`, { signal: AbortSignal.timeout(1_000) });
        if (r.ok) {
          await r.arrayBuffer();
          return { pid: proc.pid, banner: this.banner.trim() };
        }
      } catch {
        // not listening yet
      }
      await Bun.sleep(50);
    }
    await this.stop();
    throw new Error(`${req.id} did not answer within 15 s`);
  }

  private async drain(stream: ReadableStream<Uint8Array>): Promise<void> {
    const decoder = new TextDecoder();
    for await (const chunk of stream) if (this.banner.length < 4_096) this.banner += decoder.decode(chunk);
  }

  async stop(): Promise<{ stopped: boolean }> {
    const proc = this.server;
    if (!proc) return { stopped: false };
    proc.kill("SIGKILL");
    await proc.exited;
    this.server = null;
    return { stopped: true };
  }

  shape(mbit: number | null): { nic: string; command: string } {
    if (!this.nic) throw new Error("no NIC to shape (started with --nic=none)");
    const cmd = shapeCommand(this.nic, mbit);
    const r = Bun.spawnSync({ cmd, stdout: "pipe", stderr: "pipe" });
    // deleting a root qdisc that was never replaced fails harmlessly
    if (r.exitCode !== 0 && mbit !== null) throw new Error(`${cmd.join(" ")}: ${r.stderr.toString().trim()}`);
    return { nic: this.nic, command: cmd.join(" ") };
  }
}

async function json(req: Request): Promise<unknown> {
  const text = await req.text();
  return text === "" ? {} : JSON.parse(text);
}

if (import.meta.main) {
  const binDir = resolve(arg("bin-dir") ?? "build/bin");
  const port = numberArg("port", 9000);
  const nic = resolveNic(arg("nic") ?? "none");
  const cpus = arg("cpus") ?? null;
  const agent = new Agent(binDir, numberArg("server-port", 8080), nic, cpus);
  Bun.serve({
    port,
    hostname: "0.0.0.0",
    async fetch(req) {
      const path = new URL(req.url).pathname;
      try {
        if (req.method === "GET" && path === "/health") return new Response("ok\n");
        if (req.method === "GET" && path === "/stats") return Response.json(agent.stats());
        if (req.method === "POST" && path === "/start") return Response.json(await agent.start(startRequest(await json(req))));
        if (req.method === "POST" && path === "/stop") return Response.json(await agent.stop());
        if (req.method === "POST" && path === "/shape") {
          const body = await json(req);
          const mbit = typeof body === "object" && body !== null && "flowRateMbit" in body && typeof body.flowRateMbit === "number" ? body.flowRateMbit : null;
          return Response.json(agent.shape(mbit));
        }
        return new Response("not found\n", { status: 404 });
      } catch (e) {
        return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
      }
    },
  });
  console.log(`agent on :${port}, binaries in ${binDir}, nic ${nic ?? "none"}, server cpus ${cpus ?? "all"}`);
}
