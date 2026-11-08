/**
 * Builds each candidate's bench server (docs/adr/0001-what-the-benchmark-answers.md, "Builds"): one generated
 * project per candidate from `servers/<framework>/`, `cargo build --release` in a target dir of its own, the
 * binary copied to `<out>/bin/<id>`. The change lane's base is built first and its Cargo.lock seeds the head's,
 * so the two differ only in the framework's own crates; the build refuses the pair if anything else moved.
 *   bun run src/build.ts [--lane=change|frameworks] [--candidates=a,b] [--out=build]
 */
import { chmodSync, copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { type Candidate, isLane, isRust, LANES, planCandidates, renderManifest, WORKSPACE_CRATES } from "./candidates";
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
  const framework = c.framework;
  if (!isRust(framework)) throw new Error(`${c.id} has no Cargo.lock`);
  const own = new Set<string>([framework, ...WORKSPACE_CRATES[framework]]);
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

/** The sha256 of every file under a directory, in path order: one hash for a server that is many files. */
function treeSha256(dir: string): string {
  const files: string[] = [];
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile()) files.push(p);
    }
  };
  walk(dir);
  const h = new Bun.CryptoHasher("sha256");
  for (const f of files) h.update(`${relative(dir, f)}\0${sha256(f)}\n`);
  return h.digest("hex");
}

/**
 * The script the agent starts as `bin/<id>`: it runs the server from the files beside it, reading `ADDR`
 * (host:port) and `STATIC_DIR` from the agent's environment. A runtime the rig installs under /opt/bench/runtimes
 * comes first, then the one on PATH, so a local run uses the machine's own.
 */
export function launcher(c: Candidate): string {
  const here = `"$(cd "$(dirname "$0")" && pwd)/${c.id}`;
  const pick = (name: string, path: string) => `${name}=${path}; [ -x "$${name}" ] || ${name}=${name.toLowerCase()}`;
  switch (c.framework) {
    case "spring":
      return `#!/bin/sh\n# Spring Boot's executable jar, as its docs run one\nexec java -jar ${here}.jar" --server.address="\${ADDR%:*}" --server.port="\${ADDR##*:}"\n`;
    case "express":
      return `#!/bin/sh\n${pick("NODE", "/opt/bench/runtimes/node/bin/node")}\nexec "$NODE" ${here}.d/server.js"\n`;
    case "bun":
      return `#!/bin/sh\n${pick("BUN", "/opt/bench/runtimes/bun/bun")}\nexec "$BUN" ${here}.d/cluster.ts"\n`;
    case "apache":
      return `#!/bin/sh\n${pick("APACHE2", "/usr/sbin/apache2")}\nexport APACHE_MODULES="\${APACHE_MODULES:-/usr/lib/apache2/modules}" APACHE_STATE="$(mktemp -d)"\nchmod 755 "$APACHE_STATE"\nexec "$APACHE2" -DFOREGROUND -f ${here}.d/httpd.conf"\n`;
    case "nginx": {
      return `#!/bin/sh\n${pick("NGINX", "/usr/sbin/nginx")}\nstate="$(mktemp -d)"\nchmod 755 "$state"\nsed -e "s#@ADDR@#$ADDR#" -e "s#@STATIC_DIR@#$STATIC_DIR#" -e "s#@STATE@#$state#" ${here}.d/nginx.conf.in" > "$state/nginx.conf"\nexec "$NGINX" -p "$state" -c "$state/nginx.conf" -g "daemon off;"\n`;
    }
    default:
      throw new Error(`${c.id} is a Rust candidate, which builds a binary`);
  }
}

/** A server outside Rust: its folder copied beside its launcher, and built where it builds. */
function buildRelease(c: Candidate, out: string): BuildRecord {
  const bin = join(out, "bin");
  mkdirSync(bin, { recursive: true });
  const src = join(ROOT, "servers", c.framework);
  const dir = join(bin, `${c.id}.d`);
  rmSync(dir, { recursive: true, force: true });
  console.log(`== building ${c.id} (${c.label})`);
  const started = performance.now();
  const versions: Record<string, string> = {};
  let artifact = dir;
  if (c.framework === "spring") {
    // Maven builds the executable jar in a copy of the project; only the jar ships
    const project = join(out, c.id);
    rmSync(project, { recursive: true, force: true });
    cpSync(src, project, { recursive: true });
    run(["./mvnw", "-B", "-q", "-DskipTests", "package"], project);
    artifact = join(bin, `${c.id}.jar`);
    copyFileSync(join(project, "target", "bench-spring.jar"), artifact);
    versions["spring-boot"] = /<artifactId>spring-boot-starter-parent<\/artifactId>\s*<version>([^<]+)</.exec(readFileSync(join(src, "pom.xml"), "utf8"))?.[1] ?? "";
    // java -version writes to stderr, after any "Picked up ..." notes about the environment
    const java = Bun.spawnSync({ cmd: ["java", "-version"], stdout: "pipe", stderr: "pipe" });
    versions["java (build)"] = `${java.stdout.toString()}${java.stderr.toString()}`.split("\n").find((l) => / version /.test(l))?.trim() ?? "";
  } else {
    cpSync(src, dir, { recursive: true });
    if (c.framework === "express") {
      run(["npm", "ci", "--omit=dev", "--no-audit", "--no-fund"], dir);
      const lock: unknown = JSON.parse(readFileSync(join(dir, "package-lock.json"), "utf8"));
      const pkgs = typeof lock === "object" && lock !== null && "packages" in lock && typeof lock.packages === "object" && lock.packages !== null ? new Map<string, unknown>(Object.entries(lock.packages)) : new Map<string, unknown>();
      const express = pkgs.get("node_modules/express");
      if (typeof express === "object" && express !== null && "version" in express && typeof express.version === "string") versions["express"] = express.version;
    }
  }
  const launcherPath = join(bin, c.id);
  writeFileSync(launcherPath, launcher(c));
  chmodSync(launcherPath, 0o755);
  const seconds = Math.round((performance.now() - started) / 100) / 10;
  const digest = statSync(artifact).isDirectory() ? treeSha256(artifact) : sha256(artifact);
  const bytes = statSync(artifact).isDirectory() ? 0 : statSync(artifact).size;
  const record = { id: c.id, label: c.label, framework: c.framework, source: c.source, binary: launcherPath, sha256: digest, bytes, seconds, versions };
  console.log(`   ${c.id}: ${digest.slice(0, 16)} in ${seconds}s; ${Object.entries(versions).map(([k, v]) => `${k}=${v}`).join(" ")}`);
  return record;
}

function build(c: Candidate, out: string, seedLock?: string): BuildRecord {
  if (!isRust(c.framework)) return buildRelease(c, out);
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
