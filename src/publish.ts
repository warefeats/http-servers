/**
 * The site's run file from a framework run (docs/adr/0001-what-the-benchmark-answers.md, "Result"): one section per
 * cell, each candidate's samples one value per pass (an instance pair), capacity cells ranked by the ADR's rule and
 * the rest reported, not ranked. The verdict lines it writes are the numbers alone; the post's prose is authored.
 *   bun run src/publish.ts --id=2026-11-09-aws-graviton4 [--label="..."] [--out=path] runs/raw/<run>/<pass>/results/results.json ...
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { candidate, type Framework, serves } from "./candidates";
import { arg } from "./cli";
import type { StepRecord, WindowRecord } from "./measure";
import type { Cell } from "./protocol";
import type { CellRecord, RunFile } from "./run";
import { mean, median, overlaps, tInterval } from "./stats";

const ROOT = resolve(import.meta.dir, "..");

/** us-east-1 on demand, ADR 0001 "Facts": a c8gn.4xlarge, the server's instance. */
export const SERVER_DOLLARS_PER_HOUR = 0.95;

interface Statistics {
  medianMs: number;
  meanMs: number;
  minMs: number;
  maxMs: number;
}

interface SiteCandidate {
  id: string;
  name: string;
  version: string;
  logo?: string;
  color?: string;
  homepage?: string;
  statistics: Statistics;
  samplesMs: number[];
  metrics?: Record<string, { value: number; unit: string; label?: string }>;
}

interface SiteSection {
  id: string;
  title: string;
  deck: string;
  unit: string;
  lowerIsBetter: boolean;
  /** A capacity is the highest step a search held, so independent passes can land on the same value. */
  stepped?: true;
  verdict: { winnerId: string; headline: string; summary: string };
  candidates: SiteCandidate[];
}

/** How each framework shows on the site: its name, logo and color, and the version its candidate pins. */
const FRAMEWORKS: Record<Framework, Omit<SiteCandidate, "id" | "version" | "statistics" | "samplesMs">> = {
  "actix-web": { name: "actix-web", homepage: "https://actix.rs" },
  axum: { name: "axum", homepage: "https://github.com/tokio-rs/axum" },
  rama: { name: "rama", homepage: "https://ramaproxy.org" },
  spring: { name: "Spring Boot", homepage: "https://spring.io/projects/spring-boot" },
  express: { name: "Express", homepage: "https://expressjs.com" },
  bun: { name: "Bun", homepage: "https://bun.sh" },
  apache: { name: "Apache httpd", homepage: "https://httpd.apache.org" },
  nginx: { name: "nginx", homepage: "https://nginx.org" },
};

/** What each published cell's section says it measured; the proof cells are the change lane's alone. */
const SECTIONS: Partial<Record<Cell["id"], { title: string; deck: string }>> = {
  json: { title: "Small JSON", deck: "A 1 KB JSON document built and serialized on every request: the highest rate held at p99 ≤ 50 ms." },
  "json-40k": { title: "40 KB JSON", deck: "A 263-item JSON document, 40,039 bytes, built and serialized on every request." },
  "json-323k": { title: "323 KB JSON", deck: "A 2,100-item JSON document, 323,142 bytes, built and serialized on every request." },
  "16k": { title: "16 KB body", deck: "16,384 bytes from one shared buffer, or a file for Apache httpd and nginx, under actix-web's 32 KiB write-buffer threshold." },
  "323k": { title: "323 KB shared body", deck: "323,000 bytes cloned from one shared buffer, as a server answers from a cache, or a file for Apache httpd and nginx." },
  "323k-fresh": { title: "323 KB body built per request", deck: "The same 323,000 bytes copied into a new buffer on every request." },
  "slow-323k": { title: "Slow clients, 323 KB shared body", deck: "Peak memory growth with 1,000 keep-alive clients, each paced at 10 Mbit/s with 40 ms added round trip." },
  "slow-323k-fresh": { title: "Slow clients, 323 KB body built per request", deck: "Peak memory growth with 1,000 slow keep-alive clients on the per-request body." },
  "slow-json-40k": { title: "Slow clients, 40 KB JSON", deck: "Peak memory growth with 1,000 slow keep-alive clients on the 40 KB JSON document." },
  "slow-json-323k": { title: "Slow clients, 323 KB JSON", deck: "Peak memory growth with 1,000 slow keep-alive clients on the 323 KB JSON document." },
  file: { title: "64 MiB file", deck: "64 keep-alive clients downloading a 64 MiB file through each server's own file serving, nothing shaped." },
};

function statistics(samples: readonly number[]): Statistics {
  return { medianMs: median(samples), meanMs: mean(samples), minMs: Math.min(...samples), maxMs: Math.max(...samples) };
}

/** The highest held step of one capacity search. */
function topStep(rec: CellRecord): StepRecord | undefined {
  return (rec.capacity?.steps ?? []).filter((s) => s.held).reduce<StepRecord | undefined>((best, s) => (!best || s.offeredRps > best.offeredRps ? s : best), undefined);
}

const round = (n: number, digits: number) => Math.round(n * 10 ** digits) / 10 ** digits;
/** A headline value to three significant figures, as the site's charts print it. */
const fmt = (n: number) => Number(n.toPrecision(3)).toLocaleString("en-US");

/**
 * The ADR's ranking: the higher (or lower) mean wins when the 95% t-intervals of the passes don't overlap; otherwise
 * it is a tie, and the section names no winner.
 */
export function rank(samples: Record<string, number[]>, lowerIsBetter: boolean): string {
  const ids = Object.keys(samples);
  if (ids.length < 2 || ids.some((id) => (samples[id]?.length ?? 0) < 2)) return "";
  const intervals = ids.map((id) => ({ id, i: tInterval(samples[id] ?? []) }));
  intervals.sort((a, b) => (lowerIsBetter ? a.i.estimate - b.i.estimate : b.i.estimate - a.i.estimate));
  const [first, second] = intervals;
  return first && second && !overlaps(first.i, second.i) ? first.id : "";
}

interface Measure {
  /** A pass's value of the section's own measure, or null when the pass has none. */
  value: (rec: CellRecord) => number | null;
  unit: string;
  lowerIsBetter: boolean;
  ranked: boolean;
  /** The other numbers a candidate's row shows, medians over its passes. */
  metrics: (recs: CellRecord[]) => SiteCandidate["metrics"];
}

const medianOf = (xs: (number | null | undefined)[]) => median(xs.filter((x): x is number => typeof x === "number" && Number.isFinite(x)));

function measureFor(cell: Cell): Measure | null {
  if (cell.kind === "capacity") {
    return {
      value: (r) => r.capacity?.capacityRps ?? null,
      unit: "responses/s",
      lowerIsBetter: false,
      ranked: true,
      metrics: (recs) => {
        const cap = medianOf(recs.map((r) => r.capacity?.capacityRps));
        return {
          cpu: { value: round(medianOf(recs.map((r) => topStep(r)?.window.usPerResponse)), 1), unit: "µs/response", label: "Server CPU at its highest held rate" },
          p99: { value: round(medianOf(recs.map((r) => topStep(r)?.p99Ms)), 2), unit: "ms", label: "p99 at its highest held rate" },
          memory: { value: round(medianOf(recs.map((r) => r.peakGrowthMb)), 1), unit: "MB", label: "Peak memory growth" },
          price: { value: round((SERVER_DOLLARS_PER_HOUR / (cap * 3600)) * 1e6, 6), unit: "$/million responses", label: "Server instance cost at capacity" },
        };
      },
    };
  }
  if (cell.kind === "slow") {
    const w = (r: CellRecord): WindowRecord | undefined => r.slow;
    return {
      value: (r) => r.peakGrowthMb,
      unit: "MB",
      lowerIsBetter: true,
      ranked: false,
      metrics: (recs) => ({
        cpu: { value: round(medianOf(recs.map((r) => w(r)?.usPerResponse)), 1), unit: "µs/response", label: "Server CPU" },
        p99: { value: round(medianOf(recs.map((r) => w(r)?.oha.p99Ms)), 1), unit: "ms", label: "p99 the slow clients saw" },
        rate: { value: Math.round(medianOf(recs.map((r) => w(r)?.achievedRps))), unit: "responses/s", label: "Responses served" },
      }),
    };
  }
  if (cell.kind === "bulk") {
    const bytes = cell.bytes;
    return {
      value: (r) => (r.bulk ? (r.bulk.achievedRps * bytes * 8) / 1e9 : null),
      unit: "Gbit/s",
      lowerIsBetter: false,
      ranked: false,
      metrics: (recs) => ({
        cpu: { value: round(medianOf(recs.map((r) => (r.bulk?.usPerResponse ?? Number.NaN) / 1000)), 2), unit: "ms/response", label: "Server CPU per download" },
        memory: { value: round(medianOf(recs.map((r) => r.peakGrowthMb)), 1), unit: "MB", label: "Peak memory growth" },
        p99: { value: Math.round(medianOf(recs.map((r) => r.bulk?.oha.p99Ms))), unit: "ms", label: "p99 download time" },
      }),
    };
  }
  return null;
}

/** The runtimes a framework run used: rustc from its build record, the rest as the agent recorded them. */
export function runtimes(host: Record<string, string>, rustc: string | undefined): string {
  const pick = (key: string, re: RegExp) => re.exec(host[`runtime ${key}`] ?? "")?.[1];
  const named: [string, string | undefined][] = [
    ["Rust release builds with rustc", /rustc (\S+)/.exec(rustc ?? "")?.[1]],
    ["OpenJDK", pick("java", /version "(\d+(?:\.\d+){0,2})/)],
    ["Node.js", pick("node", /v?(\d+\.\d+\.\d+)/)],
    ["Bun", pick("bun", /(\d+\.\d+\.\d+)/)],
    ["Apache httpd", pick("apache2", /Apache\/(\S+)/)],
    ["nginx", pick("nginx", /nginx\/(\S+)/)],
  ];
  const parts = named.filter(([, v]) => v).map(([name, v]) => `${name} ${v}`);
  return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : (parts[0] ?? "");
}

/** One section per cell of the lane, with the candidates that serve its route, in the run's order. */
export function sections(runs: readonly RunFile[], versions: Record<string, string>): SiteSection[] {
  const first = runs[0];
  if (!first) throw new Error("no runs");
  return first.protocol.cells.flatMap((cell): SiteSection[] => {
    const m = measureFor(cell);
    const text = SECTIONS[cell.id];
    if (!m || !text) return [];
    const recsFor = (id: string) => runs.flatMap((run) => run.cells.filter((c) => c.cell === cell.id && c.arm === id && !c.error));
    const candidates = first.candidates.filter((c) => serves(candidate(c.id), cell.route)).map((c): SiteCandidate => {
      const recs = recsFor(c.id);
      const samples = recs.map(m.value).filter((x): x is number => x !== null && Number.isFinite(x)).map((x) => round(x, 2));
      const framework = candidate(c.id).framework;
      const look = FRAMEWORKS[framework];
      if (!look) throw new Error(`no site entry for ${framework}`);
      return { id: framework, ...look, version: versions[c.id] ?? c.label.replace(/^\S+\s+/, ""), statistics: statistics(samples), samplesMs: samples, metrics: m.metrics(recs) };
    });
    const winnerId = m.ranked ? rank(Object.fromEntries(candidates.map((c) => [c.id, c.samplesMs])), m.lowerIsBetter) : "";
    const line = candidates.map((c) => `${c.name} ${fmt(c.statistics.meanMs)} ${m.unit}`).join(", ");
    const stepped = cell.kind === "capacity" ? { stepped: true as const } : {};
    return [{ id: cell.id, title: text.title, deck: text.deck, unit: m.unit, lowerIsBetter: m.lowerIsBetter, ...stepped, verdict: { winnerId, headline: line, summary: "" }, candidates }];
  });
}

function isRunFile(v: unknown): v is RunFile {
  return typeof v === "object" && v !== null && "schema" in v && v.schema === 1 && "cells" in v && Array.isArray(v.cells);
}

if (import.meta.main) {
  const files = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const runs = files.map((path) => {
    const v: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (!isRunFile(v)) throw new Error(`${path} is not a run file`);
    if (v.lane !== "frameworks") throw new Error(`${path} is a ${v.lane} run; only the framework lane is published`);
    return v;
  });
  const first = runs[0];
  if (!first) throw new Error("usage: bun run src/publish.ts --id=<date>-aws-graviton4 --label=<label> <results.json> ...");
  // the crate versions every pass's build resolved, by candidate (build-record.json beside each pass's results)
  const versions: Record<string, string> = {};
  let rustc: string | undefined;
  for (const path of files) {
    const record: unknown = JSON.parse(readFileSync(join(path, "..", "..", "build-record.json"), "utf8"));
    if (typeof record === "object" && record !== null && "rustc" in record && typeof record.rustc === "string") rustc ??= record.rustc;
    if (typeof record !== "object" || record === null || !("candidates" in record) || !Array.isArray(record.candidates)) continue;
    for (const c of record.candidates) {
      if (typeof c !== "object" || c === null || !("id" in c) || !("versions" in c) || typeof c.id !== "string" || typeof c.versions !== "object" || c.versions === null) continue;
      const v = new Map<string, unknown>(Object.entries(c.versions));
      const framework = candidate(c.id).framework;
      if (framework === "actix-web" || framework === "axum" || framework === "rama") {
        const own = v.get(framework);
        const httpName = framework === "axum" ? "hyper" : framework === "rama" ? "rama-http-core" : "actix-http";
        const http = v.get(httpName);
        if (typeof own === "string") versions[c.id] = typeof http === "string" ? `${own} (${httpName} ${http})` : own;
      } else {
        const { source: src, label } = candidate(c.id);
        if (src.kind !== "release") continue;
        // Ubuntu's apache2 is named by its series; the agent recorded the exact build
        const version = (framework === "apache" ? /Apache\/(\S+)/.exec(first.host["runtime apache2"] ?? "")?.[1] : undefined) ?? src.version;
        versions[c.id] = src.runtime === label ? version : `${version} (${src.runtime})`;
      }
    }
  }
  const id = arg("id") ?? `${new Date().toISOString().slice(0, 10)}-aws-graviton4`;
  const out = {
    schemaVersion: 1,
    id,
    label: arg("label") ?? "AWS Graviton4, c8gn.4xlarge server and client",
    // the site reads a date, YYYY-MM-DD, and the post's slug starts with it: the run id's date, else today's
    publishedAt: /^\d{4}-\d{2}-\d{2}/.exec(id)?.[0] ?? new Date().toISOString().slice(0, 10),
    environment: {
      machine: "AWS c8gn.4xlarge server, its processes pinned to 4 of 16 cores, and a c8gn.4xlarge client, one cluster placement group",
      chip: "AWS Graviton4",
      cores: "4 (server)",
      memory: "32 GiB each",
      os: `Ubuntu 24.04 LTS arm64, kernel ${first.host["kernel"] ?? ""}`,
      arch: "arm64",
      runtime: `Each server at its documented setup: ${runtimes(first.host, rustc)}; ${first.host["oha"] ?? "oha"}; plain HTTP/1.1 keep-alive, no TLS, 50 Gbps between the instances`,
    },
    protocol: {
      warmups: first.protocol.warmupS,
      runs: runs.length,
      processModel: "A fresh server process group per cell on the server's 4 cores, each server sizing its own workers; every server but Bun listens with actix-web's backlog of 1,024 from its own settings, since Bun.serve has none",
      cacheState: "JSON built on every request; byte bodies from one shared buffer, or a new one per request on /323k-fresh, while Apache httpd and nginx serve them as files; the 64 MiB file stays in the page cache",
      output: "Capacity: the highest open-loop rate held with p99 at most 50 ms, at most 0.1% errors and at least 95% delivered, doubling then bisecting three times; CPU per response from the server's user plus system time and peak memory growth from VmHWM, each summed over its processes",
      clientSizing: `${first.host["ohaProcesses"] ?? "8"} oha processes, open loop with latency correction; 1,000 paced clients in the slow cells; 64 in the file cell`,
    },
    sections: sections(runs, versions),
  };
  const path = resolve(arg("out") ?? join(ROOT, "runs", `${id}.json`));
  writeFileSync(path, `${JSON.stringify(out, null, 1)}\n`);
  console.log(`wrote ${path}: ${out.sections.length} sections from ${runs.length} pass(es)`);
  for (const s of out.sections) console.log(`  ${s.id}: ${s.verdict.winnerId || "no winner"}; ${s.verdict.headline}`);
}
