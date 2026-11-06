/**
 * Builds each candidate's bench server (docs/adr/0001-what-the-benchmark-answers.md, "Builds"): one generated
 * project per candidate from `servers/<framework>/`, `cargo build --release` in a target dir of its own, the
 * binary copied to `<out>/bin/<id>`. The change lane's base is built first and its Cargo.lock seeds the head's,
 * so the two differ only in the framework's own crates; the build refuses the pair if anything else moved.
 *   bun run src/build.ts [--lane=change|frameworks] [--candidates=a,b] [--out=build]
 */
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { type Candidate, isLane, LANES, planCandidates, renderManifest, WORKSPACE_CRATES } from "./candidates";
import { arg } from "./cli";

const ROOT = resolve(import.meta.dir, "..");

/** Crates whose resolved version the record keeps for every candidate. */
export const WATCHED = ["tokio", "mio", "bytes", "socket2", "hyper", "hyper-util", "http", "actix-http", "actix-web", "actix-server", "actix-rt", "actix-files", "axum", "axum-core", "tower-http", "serde_json"];

interface LockPackage {
  name: string;
  version: string;
  source?: string;
}

export function lockPackages(lockText: string): LockPackage[] {
  const parsed: unknown = Bun.TOML.parse(lockText);
  if (typeof parsed !== "object" || parsed === null || !("package" in parsed) || !Array.isArray(parsed.package)) throw new Error("Cargo.lock has no [[package]] entries");
  return parsed.package.flatMap((p: unknown): LockPackage[] => {
    if (typeof p !== "object" || p === null || !("name" in p) || !("version" in p)) return [];
    const { name, version } = p;
    if (typeof name !== "string" || typeof version !== "string") return [];
    const source = "source" in p && typeof p.source === "string" ? p.source : undefined;
    return [{ name, version, source }];
  });
}

/** Every locked package outside the candidate's own framework crates, as `name version source`. */
export function foreignPackages(packages: LockPackage[], c: Candidate): string[] {
  const own = new Set([c.framework, ...WORKSPACE_CRATES[c.framework]]);
  if (c.framework === "axum") own.add("axum-core");
  return packages
    .filter((p) => !(own.has(p.name) && (p.source === undefined || p.source.startsWith("git+") || p.source.startsWith("registry+"))))
    .filter((p) => !p.name.startsWith("bench-"))
    .map((p) => `${p.name} ${p.version} ${p.source ?? "path"}`)
    .sort();
}

/** The lines on which two lockfiles disagree outside the framework's own crates. */
export function pairDrift(baseLock: string, headLock: string, base: Candidate, head: Candidate): string[] {
  const a = new Set(foreignPackages(lockPackages(baseLock), base));
  const b = new Set(foreignPackages(lockPackages(headLock), head));
  return [...[...a].filter((x) => !b.has(x)).map((x) => `- ${x}`), ...[...b].filter((x) => !a.has(x)).map((x) => `+ ${x}`)];
}

function run(cmd: string[], cwd: string, env: Record<string, string> = {}): void {
  const p = Bun.spawnSync({ cmd, cwd, env: { ...process.env, ...env }, stdout: "inherit", stderr: "inherit" });
  if (p.exitCode !== 0) throw new Error(`${cmd.join(" ")} exited ${p.exitCode} in ${cwd}`);
}

function capture(cmd: string[]): string {
  const p = Bun.spawnSync({ cmd, stdout: "pipe", stderr: "pipe" });
  return p.stdout.toString().trim();
}

function sha256(path: string): string {
  const h = new Bun.CryptoHasher("sha256");
  h.update(readFileSync(path));
  return h.digest("hex");
}

export interface BuildRecord {
  id: string;
  label: string;
  framework: Candidate["framework"];
  source: Candidate["source"];
  binary: string;
  sha256: string;
  bytes: number;
  seconds: number;
  versions: Record<string, string>;
}

function build(c: Candidate, out: string, seedLock?: string): BuildRecord {
  const project = join(out, c.id);
  rmSync(project, { recursive: true, force: true });
  mkdirSync(project, { recursive: true });
  cpSync(join(ROOT, "servers", c.framework, "src"), join(project, "src"), { recursive: true });
  const template = readFileSync(join(ROOT, "servers", c.framework, "Cargo.toml.in"), "utf8");
  writeFileSync(join(project, "Cargo.toml"), renderManifest(template, c, join(ROOT, "servers", "common")));
  if (seedLock) copyFileSync(seedLock, join(project, "Cargo.lock"));
  console.log(`== building ${c.id} (${c.label})`);
  const started = performance.now();
  run(["cargo", "build", "--release"], project, { CARGO_TARGET_DIR: join(out, "target", c.id) });
  const seconds = Math.round((performance.now() - started) / 100) / 10;
  const binary = join(out, "bin", c.id);
  mkdirSync(join(out, "bin"), { recursive: true });
  copyFileSync(join(out, "target", c.id, "release", `bench-${c.framework}`), binary);
  const lock = lockPackages(readFileSync(join(project, "Cargo.lock"), "utf8"));
  const versions = Object.fromEntries(WATCHED.flatMap((name) => lock.filter((p) => p.name === name).map((p) => [name, p.version] as const)));
  const record = { id: c.id, label: c.label, framework: c.framework, source: c.source, binary, sha256: sha256(binary), bytes: statSync(binary).size, seconds, versions };
  console.log(`   ${c.id}: ${record.sha256.slice(0, 16)} ${(record.bytes / 1e6).toFixed(1)} MB in ${seconds}s; ${Object.entries(versions).map(([k, v]) => `${k}=${v}`).join(" ")}`);
  return record;
}

if (import.meta.main) {
  const laneArg = arg("lane") ?? "change";
  if (!isLane(laneArg)) throw new Error(`--lane must be frameworks or change, not ${laneArg}`);
  const lane = LANES[laneArg];
  const out = resolve(arg("out") ?? join(ROOT, "build"));
  const candidates = planCandidates(lane, arg("candidates") ?? "");
  // the change lane's base goes first so its lockfile can seed the head's
  const pair = lane.pair && candidates.some((c) => c.id === lane.pair?.base) && candidates.some((c) => c.id === lane.pair?.head) ? lane.pair : undefined;
  const ordered = pair ? [...candidates].sort((a, b) => Number(b.id === pair.base) - Number(a.id === pair.base)) : candidates;
  const records: BuildRecord[] = [];
  for (const c of ordered) {
    const seed = pair && c.id === pair.head ? join(out, pair.base, "Cargo.lock") : undefined;
    records.push(build(c, out, seed));
  }
  if (pair) {
    const base = ordered.find((c) => c.id === pair.base);
    const head = ordered.find((c) => c.id === pair.head);
    if (!base || !head) throw new Error("pair members missing");
    const drift = pairDrift(readFileSync(join(out, base.id, "Cargo.lock"), "utf8"), readFileSync(join(out, head.id, "Cargo.lock"), "utf8"), base, head);
    if (drift.length > 0) throw new Error(`${head.id} resolved different crates from ${base.id} outside ${base.framework}'s own:\n${drift.join("\n")}`);
    console.log(`== ${base.id} and ${head.id} share every crate outside ${base.framework}'s own`);
  }
  const record = { builtAt: new Date().toISOString(), rustc: capture(["rustc", "-V"]), cargo: capture(["cargo", "-V"]), arch: process.arch, candidates: records };
  writeFileSync(join(out, "record.json"), `${JSON.stringify(record, null, 2)}\n`);
  if (!existsSync(join(out, "record.json"))) throw new Error("record not written");
  console.log(`== built ${records.length}: ${join(out, "bin")}`);
}
