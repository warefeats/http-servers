/**
 * A run (docs/adr/0001-what-the-benchmark-answers.md): a preflight of every candidate, then every pass, every
 * cell, every candidate back to back in an order that rotates each pass, results written after each cell.
 *   rig:   bun run src/run.ts --lane=change --mode=full --agent=http://10.0.0.5:9000 --target-host=10.0.0.5 --nic=auto --out=results/<id>
 *   local: bun run src/run.ts --local --lane=change --mode=smoke [--server-cpus=0-7 --client-cpus=8-15]
 * Locally it starts the agent itself on the built binaries in build/bin.
 */
import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { type Candidate, isLane, LANES, type LaneId, planCandidates, serves } from "./candidates";
import { arg, numberArg } from "./cli";
import { AgentClient, bulkCell, type CellResult, capacityCell, type Env, proofCell, slowCell } from "./measure";
import { hostTicks, HZ, resolveNic } from "./proc";
import { type Cell, hasAaArm, protocol, type Protocol } from "./protocol";
import { renderReport } from "./report";

const ROOT = resolve(import.meta.dir, "..");

export interface CellRecord extends CellResult {
  pass: number;
  cell: Cell["id"];
  /** The candidate id, with `#aa` for the change lane's second base run on `json` and the proof cells. */
  arm: string;
  candidate: string;
  startedAt: string;
  error?: string;
}

export interface RunFile {
  schema: 1;
  lane: LaneId;
  mode: Protocol["mode"];
  local: boolean;
  pair?: { base: string; head: string };
  candidates: { id: string; label: string }[];
  protocol: Protocol;
  host: Record<string, string>;
  preflight: Record<string, Record<string, string>>;
  startedAt: string;
  finishedAt?: string;
  cells: CellRecord[];
}

/** Arms for one cell in one pass: the candidates rotated by the pass, plus the change lane's A/A arm where the cell has one. */
export function arms(candidates: readonly Candidate[], pass: number, cell: Pick<Cell, "id" | "kind" | "route">, aaBase: string | null): string[] {
  // a static web server sits out the routes it doesn't serve
  const ids = candidates.filter((c) => serves(c, cell.route)).map((c) => c.id);
  if (aaBase && hasAaArm(cell)) ids.push(`${aaBase}#aa`);
  const k = (pass - 1) % ids.length;
  return [...ids.slice(k), ...ids.slice(0, k)];
}

function measureCell(env: Env, id: string, cell: Cell, p: Protocol, beforeWindow: () => Promise<void>): Promise<CellResult> {
  switch (cell.kind) {
    case "capacity":
      return capacityCell(env, id, cell, p, beforeWindow);
    case "slow":
      return slowCell(env, id, cell, p, beforeWindow);
    case "bulk":
      return bulkCell(env, id, cell, p, beforeWindow);
    case "proof":
      return proofCell(env, id, cell, p, beforeWindow);
  }
}

function save(path: string, run: RunFile): void {
  writeFileSync(`${path}.tmp`, `${JSON.stringify(run, null, 1)}\n`);
  renameSync(`${path}.tmp`, path);
}

async function sha256(buf: ArrayBuffer): Promise<string> {
  const h = new Bun.CryptoHasher("sha256");
  h.update(new Uint8Array(buf));
  return h.digest("hex").slice(0, 16);
}

/**
 * Every route the cells use, in every candidate that serves it: a 200 and the body's hash, which must match across
 * candidates, and a bulk cell's size, which must be the size the cell expects. Framing and content type are kept
 * as each server sends them: Express and Spring send JSON with their own content type, and a framework that streams
 * its JSON frames it chunked.
 */
async function preflight(env: Env, candidates: readonly Candidate[], cells: readonly Cell[]): Promise<Record<string, Record<string, string>>> {
  const routes = [...new Set(cells.map((c) => c.route))];
  const out: Record<string, Record<string, string>> = {};
  const hashes: Record<string, Map<string, string>> = {};
  for (const c of candidates) {
    await env.agent.start(c.id);
    try {
      const answers: Record<string, string> = {};
      out[c.id] = answers;
      for (const route of routes.filter((r) => serves(c, r))) {
        const r = await fetch(`${env.target}${route}`, { headers: { "accept-encoding": "identity" } });
        const body = await r.arrayBuffer();
        const framing = r.headers.get("transfer-encoding") ? `chunked` : `length ${r.headers.get("content-length")}`;
        const hash = await sha256(body);
        const line = `${r.status} ${framing} ${r.headers.get("content-type")} ${hash}`;
        answers[route] = line;
        (hashes[route] ??= new Map()).set(c.id, `${r.status} ${hash}`);
        if (r.status !== 200) throw new Error(`${c.id} ${route}: ${line}`);
        for (const cell of cells) {
          if (cell.kind === "bulk" && cell.route === route && body.byteLength !== cell.bytes) throw new Error(`${c.id} ${route}: ${body.byteLength} bytes where the ${cell.id} cell expects ${cell.bytes}`);
        }
      }
    } finally {
      await env.agent.stop();
    }
  }
  for (const route of routes) {
    const seen = [...(hashes[route] ?? new Map<string, string>()).entries()];
    const [firstId, firstBody] = seen[0] ?? ["", ""];
    for (const [id, body] of seen) {
      if (body !== firstBody) throw new Error(`preflight: ${id} ${route} answers "${out[id]?.[route]}" where ${firstId} answers "${out[firstId]?.[route]}"`);
    }
  }
  return out;
}

/** Local runs only: wait until the host's other work is under `cpus` over 3 s. */
async function quietHost(cpus: number, maxWaitS: number): Promise<void> {
  const t0 = Date.now();
  for (let said = 0; ; ) {
    const a = hostTicks();
    await Bun.sleep(3_000);
    const b = hostTicks();
    const busy = (b.busy - a.busy) / HZ / 3;
    if (busy < cpus) return;
    const waited = Math.round((Date.now() - t0) / 1000);
    if (waited >= maxWaitS) {
      console.log(`  host still busy (${busy.toFixed(1)} CPUs) after ${waited}s; measuring anyway`);
      return;
    }
    if (waited - said >= 60 || said === 0) {
      console.log(`  waiting for a quiet host: ${busy.toFixed(1)} CPUs busy`);
      said = waited || 1;
    }
  }
}

async function main(): Promise<void> {
  const laneArg = arg("lane") ?? "change";
  if (!isLane(laneArg)) throw new Error(`--lane must be frameworks or change, not ${laneArg}`);
  const lane = LANES[laneArg];
  const modeArg = arg("mode") ?? "smoke";
  if (modeArg !== "smoke" && modeArg !== "full") throw new Error(`--mode must be smoke or full, not ${modeArg}`);
  const local = arg("local") === "true";
  const candidates = planCandidates(lane, arg("candidates") ?? "");
  const p = protocol(lane.id, modeArg, local);
  p.passes = numberArg("passes", p.passes);
  // a framework run's passes are separate instance pairs, each its own job: the job's pass number keeps the
  // rotation going across them (scripts/ssm/run.sh)
  const firstPass = numberArg("first-pass", 1);
  const only = arg("cells");
  if (only) p.cells = p.cells.filter((c) => only.split(",").includes(c.id));
  const pair = lane.pair && candidates.some((c) => c.id === lane.pair?.base) && candidates.some((c) => c.id === lane.pair?.head) ? lane.pair : undefined;
  const aaBase = p.aaCell && pair ? pair.base : null;
  const out = resolve(arg("out") ?? join(ROOT, "results", `${local ? "local" : "rig"}-${lane.id}-${modeArg}-${new Date().toISOString().replace(/[:.]/g, "").slice(0, 15)}`));
  mkdirSync(out, { recursive: true });
  const file = join(out, "results.json");

  let agentProc: ReturnType<typeof Bun.spawn> | null = null;
  const agentUrl = arg("agent") ?? "http://127.0.0.1:9000";
  if (local) {
    const serverCpus = arg("server-cpus") ?? "0-7";
    agentProc = Bun.spawn({ cmd: ["bun", "run", join(ROOT, "src/agent.ts"), `--bin-dir=${resolve(arg("bin-dir") ?? join(ROOT, "build/bin"))}`, "--port=9000", "--nic=none", `--cpus=${serverCpus}`], stdout: "inherit", stderr: "inherit" });
    for (let i = 0; i < 100; i++) {
      try {
        if ((await fetch(`${agentUrl}/health`)).ok) break;
      } catch {
        await Bun.sleep(100);
      }
    }
  }
  const clientCpus = local ? (arg("client-cpus") ?? "8-15") : undefined;
  const clientCores = clientCpus ? clientCpus.split(",").reduce((n, part) => { const [a, b] = part.split("-").map(Number); return n + (b === undefined ? 1 : (b ?? 0) - (a ?? 0) + 1); }, 0) : navigator.hardwareConcurrency;
  // one oha process per two client CPUs: 4 locally on 8, 8 on the rig's 16
  const generators = numberArg("generators", Math.max(1, Math.floor(clientCores / 2)));
  const env: Env = { agent: new AgentClient(agentUrl), target: `http://${arg("target-host") ?? "127.0.0.1"}:8080`, local, clientCpus, clientCores, clientNic: local ? null : resolveNic(arg("nic") ?? "auto"), generators };
  const beforeWindow = local ? () => quietHost(numberArg("quiet-cpus", 1.0), numberArg("quiet-wait", 900)) : async () => {};

  try {
    const run: RunFile = {
      schema: 1,
      lane: lane.id,
      mode: modeArg,
      local,
      pair,
      candidates: candidates.map((c) => ({ id: c.id, label: c.label })),
      protocol: p,
      host: { hostname: (await Bun.$`hostname`.text()).trim(), kernel: (await Bun.$`uname -r`.text()).trim(), cpus: String(navigator.hardwareConcurrency), oha: (await Bun.$`oha --version`.text()).trim(), ohaProcesses: String(generators), clientPorts: (await Bun.file("/proc/sys/net/ipv4/ip_local_port_range").text()).trim().replace(/\s+/g, "-"), clientTwReuse: (await Bun.file("/proc/sys/net/ipv4/tcp_tw_reuse").text()).trim(), clientCpus: clientCpus ?? "all", serverCpus: (await env.agent.serverCpus()) ?? "all", wrk: (await env.agent.wrkVersion()) ?? "none", ...Object.fromEntries(Object.entries(await env.agent.runtimes()).map(([k, v]) => [`runtime ${k}`, v])) },
      preflight: {},
      startedAt: new Date().toISOString(),
      cells: [],
    };
    console.log(`== ${lane.id} ${modeArg}${local ? " (local)" : ""}: ${candidates.map((c) => c.label).join(", ")}; ${p.passes} pass(es) from pass ${firstPass}; cells ${p.cells.map((c) => c.id).join(", ")}; results ${file}`);
    run.preflight = await preflight(env, candidates, p.cells);
    console.log("== preflight: every route answers a 200 with the same bytes in every candidate that serves it");
    save(file, run);
    for (let pass = firstPass; pass < firstPass + p.passes; pass++) {
      for (const cell of p.cells) {
        for (const a of arms(candidates, pass, cell, aaBase)) {
          const id = a.replace(/#aa$/, "");
          console.log(`-- pass ${pass} ${cell.id} ${a}`);
          const startedAt = new Date().toISOString();
          try {
            const r = await measureCell(env, id, cell, p, beforeWindow);
            run.cells.push({ ...r, pass, cell: cell.id, arm: a, candidate: id, startedAt });
            if (r.capacity) console.log(`   ${a} ${cell.id}: capacity ${r.capacity.capacityRps.toLocaleString("en-US")}/s${r.capacity.atCeiling ? " (search ceiling)" : ""}${r.capacity.floor ? " (client-bound: a floor)" : ""}, peak growth ${r.peakGrowthMb?.toFixed(1) ?? "–"} MB`);
          } catch (e) {
            const error = e instanceof Error ? e.message : String(e);
            console.log(`   ${a} ${cell.id}: FAILED ${error}`);
            run.cells.push({ banner: "", startRssKb: null, peakGrowthMb: null, pass, cell: cell.id, arm: a, candidate: id, startedAt, error });
          }
          save(file, run);
        }
      }
    }
    run.finishedAt = new Date().toISOString();
    save(file, run);
    const report = renderReport([run]);
    writeFileSync(join(out, "report.md"), report);
    console.log(`== done ${run.finishedAt}\n\n${report}`);
  } finally {
    agentProc?.kill("SIGTERM");
  }
}

if (import.meta.main) await main();
