import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { shapeCommand, startRequest } from "../src/agent";
import { foreignPackages, lockPackages, pairDrift } from "../src/build";
import { candidate, CANDIDATES, LANES, manifestParts, planCandidates, renderManifest } from "../src/candidates";
import { findCapacity, held, highestCommonHeld, type StepOutcome } from "../src/capacity";
import { arg } from "../src/cli";
import { errorRate, gbitPerS, generatorShortfall, netemCommand, parseStats } from "../src/measure";
import { mergePasses, ohaArgs, parseOha, shares } from "../src/oha";
import { hostTicks, parseEthtool } from "../src/proc";
import { connectionsFor, protocol } from "../src/protocol";
import { arms } from "../src/run";
import { bootstrapMedian, median, overlaps, tInterval, verdict } from "../src/stats";

const ROOT = join(import.meta.dir, "..");

describe("candidates", () => {
  test("every lane names known candidates and the change pair is inside it", () => {
    for (const lane of Object.values(LANES)) for (const id of lane.candidates) expect(candidate(id).id).toBe(id);
    const pair = LANES.change.pair;
    expect(pair && LANES.change.candidates.includes(pair.base) && LANES.change.candidates.includes(pair.head)).toBe(true);
  });

  test("an empty --candidates means the lane's own, and a repeat is refused", () => {
    expect(planCandidates(LANES.frameworks, "").map((c) => c.id)).toEqual([...LANES.frameworks.candidates]);
    expect(() => planCandidates(LANES.change, "axum-0.8.9,axum-0.8.9")).toThrow("twice");
  });

  test("a crates.io candidate pins the exact version and patches nothing", () => {
    expect(manifestParts(candidate("actix-web-4.18.1"))).toEqual({ framework: 'actix-web = "=4.18.1"', patch: "" });
  });

  test("a git actix-web candidate takes every workspace crate from its commit", () => {
    const { framework, patch } = manifestParts(candidate("actix-web-pr4302"));
    expect(framework).toContain('rev = "2a3f2019d2be1ecbd005916135c0b69a74cf2038"');
    // actix-files depends on actix-web by version, so actix-web itself is patched too, or the build would hold two
    for (const name of ["actix-web", "actix-http", "actix-router", "actix-web-codegen", "actix-files"]) expect(patch).toContain(`\n${name} = { git = "https://github.com/johncarmack1984/actix-web"`);
  });

  test("the templates render to manifests with no marker left, prose untouched", () => {
    for (const c of CANDIDATES) {
      const text = renderManifest(readFileSync(join(ROOT, "servers", c.framework, "Cargo.toml.in"), "utf8"), c, "/repo/servers/common");
      expect(text).not.toMatch(/^@\w+@$/m);
      expect(text).toContain('bench-common = { path = "/repo/servers/common" }');
      expect(text.split("\n")[0]).toStartWith("# The build");
      Bun.TOML.parse(text);
    }
  });
});

const lock = (extra: string) => `version = 4

[[package]]
name = "actix-http"
version = "3.20.0"
source = "git+https://github.com/actix/actix-web?rev=81bb997#81bb997"

[[package]]
name = "tokio"
version = "1.54.1"
source = "registry+https://github.com/rust-lang/crates.io-index"

[[package]]
name = "bench-actix-web"
version = "0.0.0"
${extra}`;

describe("build", () => {
  test("a pair that differs only in the framework's crates has no drift", () => {
    const head = lock("").replaceAll("actix/actix-web?rev=81bb997#81bb997", "johncarmack1984/actix-web?rev=2a3f201#2a3f201");
    expect(pairDrift(lock(""), head, candidate("actix-web-81bb997"), candidate("actix-web-pr4302"))).toEqual([]);
  });

  test("a third-party crate that moved is drift", () => {
    const head = lock("").replace('version = "1.54.1"', 'version = "1.54.2"');
    expect(pairDrift(lock(""), head, candidate("actix-web-81bb997"), candidate("actix-web-pr4302"))).toEqual([
      "- tokio 1.54.1 registry+https://github.com/rust-lang/crates.io-index",
      "+ tokio 1.54.2 registry+https://github.com/rust-lang/crates.io-index",
    ]);
  });

  test("the bench crates themselves are not compared", () => {
    expect(foreignPackages(lockPackages(lock("")), candidate("actix-web-81bb997"))).toEqual(["tokio 1.54.1 registry+https://github.com/rust-lang/crates.io-index"]);
  });
});

describe("capacity", () => {
  // a server that holds anything up to its true capacity
  const probe = (capacity: number) => async (rps: number): Promise<StepOutcome> => ({ offeredRps: rps, achievedRps: Math.min(rps, capacity), p99Ms: rps <= capacity ? 2 : 900, errorRate: 0, held: rps <= capacity });

  test("doubles, then bisects between the last held and the first failed rate", async () => {
    const r = await findCapacity(probe(5_000), { startRps: 1_000, maxRps: 1_000_000, minRps: 10, bisections: 3 });
    expect(r.steps.map((s) => s.offeredRps)).toEqual([1_000, 2_000, 4_000, 8_000, 6_000, 5_000, 5_500]);
    expect(r.capacityRps).toBe(5_000);
  });

  test("halves when the start fails, and reports 0 below the floor", async () => {
    expect((await findCapacity(probe(300), { startRps: 1_000, maxRps: 1e6, minRps: 10, bisections: 1 })).capacityRps).toBe(250);
    expect((await findCapacity(probe(5), { startRps: 1_000, maxRps: 1e6, minRps: 100, bisections: 1 })).capacityRps).toBe(0);
  });

  test("stops at the ceiling", async () => {
    const r = await findCapacity(probe(1e9), { startRps: 1_000, maxRps: 4_000, minRps: 10, bisections: 3 });
    expect(r).toMatchObject({ capacityRps: 4_000, atCeiling: true });
  });

  test("the hold rule: p99, errors and delivery", () => {
    expect(held(1_000, 990, 49, 0)).toBe(true);
    expect(held(1_000, 990, 51, 0)).toBe(false);
    expect(held(1_000, 990, 10, 0.002)).toBe(false);
    expect(held(1_000, 900, 10, 0)).toBe(false);
    expect(held(1_000, 990, null, 0)).toBe(false);
  });

  test("the highest rate every search held among the rates they all probed", () => {
    const s = (rps: number, ok: boolean): StepOutcome => ({ offeredRps: rps, achievedRps: rps, p99Ms: 1, errorRate: 0, held: ok });
    expect(highestCommonHeld([[s(1, true), s(2, true), s(4, false), s(3, true)], [s(1, true), s(2, true), s(4, true), s(8, false)]])).toBe(2);
    expect(highestCommonHeld([[s(1, false)], [s(1, true)]])).toBe(null);
  });
});

describe("stats", () => {
  test("median", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([])).toBeNaN();
  });

  test("the bootstrap is deterministic and brackets the median", () => {
    const xs = [0.98, 1.01, 0.99, 1.02, 1.0, 0.97];
    const a = bootstrapMedian(xs);
    expect(bootstrapMedian(xs)).toEqual(a);
    expect(a.lo).toBeLessThanOrEqual(a.estimate);
    expect(a.hi).toBeGreaterThanOrEqual(a.estimate);
    expect(verdict(a, true)).toBe("no measurable change");
  });

  test("verdicts read the direction against what is better", () => {
    const up = { estimate: 1.2, lo: 1.1, hi: 1.3, n: 6 };
    expect(verdict(up, true)).toBe("better");
    expect(verdict(up, false)).toBe("worse");
    expect(verdict({ estimate: 1, lo: Number.NaN, hi: Number.NaN, n: 1 }, true)).toBe("too few passes");
    expect(verdict({ estimate: 1.017, lo: 1.017, hi: 1.017, n: 1 }, false)).toBe("too few passes");
  });

  test("t intervals tie when they overlap", () => {
    const a = tInterval([100, 104, 98]);
    const b = tInterval([101, 99, 103]);
    expect(overlaps(a, b)).toBe(true);
    expect(overlaps(tInterval([100, 101, 100]), tInterval([200, 201, 200]))).toBe(false);
  });
});

describe("oha", () => {
  const json = JSON.stringify({
    summary: { total: 7.01, slowest: 0.08, sizePerRequest: 323000 },
    latencyPercentiles: { p50: 0.0021, p90: 0.004, p99: 0.0123, "p99.9": 0.03 },
    statusCodeDistribution: { "200": 6990, "503": 10 },
    errorDistribution: { "aborted due to deadline": 12, "connection reset": 3 },
  });

  test("parses counts, errors and percentiles", () => {
    const p = parseOha(json);
    expect(p).toMatchObject({ completed: 7000, success: 6990, transportErrors: 3, abortedAtDeadline: 12, p50Ms: 2.1, p99Ms: 12.3, bytesPerResponse: 323000 });
    expect(errorRate(p)).toBeCloseTo(13 / 7003, 9);
  });

  test("open loop adds the rate and the latency correction; local runs pin oha", () => {
    expect(ohaArgs({ url: "http://h:8080/json", connections: 64, durationSeconds: 7, rate: 5000, timeoutSeconds: 10, cpus: "8-15" })).toEqual([
      "taskset", "-c", "8-15", "oha", "--no-tui", "--output-format", "json", "--disable-compression", "-t", "10s", "-c", "64", "-z", "7s", "-q", "5000", "--latency-correction", "http://h:8080/json",
    ]);
  });

  test("the load splits into equal shares, at least 8 connections each", () => {
    const parts = shares({ url: "u", connections: 2048, durationSeconds: 7, rate: 256_000, timeoutSeconds: 10, processes: 4 });
    expect(parts.map((p) => [p.connections, p.rate])).toEqual([[512, 64_000], [512, 64_000], [512, 64_000], [512, 64_000]]);
    expect(shares({ url: "u", connections: 16, durationSeconds: 7, rate: 375, timeoutSeconds: 10, processes: 4 }).map((p) => [p.connections, p.rate])).toEqual([[8, 188], [8, 188]]);
    expect(shares({ url: "u", connections: 64, durationSeconds: 7, timeoutSeconds: 10 })).toHaveLength(1);
  });

  test("merged passes add counts and keep each process's worst percentile", () => {
    const a = parseOha(json);
    const b = { ...a, success: 10, completed: 10, statusCodes: { "200": 10 }, p99Ms: 40, p50Ms: 1 };
    const m = mergePasses([a, b]);
    expect(m).toMatchObject({ completed: 7010, success: 7000, p99Ms: 40, p50Ms: 2.1, statusCodes: { "200": 7000, "503": 10 }, errors: { "connection reset": 6 } });
  });

  test("a delivery-only failure with fast answers is the generator's", () => {
    const pass = parseOha(json);
    expect(generatorShortfall(256_000, { achievedRps: 164_000, errorRate: 0, oha: { ...pass, p99Ms: 3.6 } })).toBe(true);
    expect(generatorShortfall(256_000, { achievedRps: 164_000, errorRate: 0, oha: { ...pass, p99Ms: 900 } })).toBe(false);
    expect(generatorShortfall(256_000, { achievedRps: 250_000, errorRate: 0, oha: { ...pass, p99Ms: 3.6 } })).toBe(false);
  });

  test("connections follow the rate within bounds", () => {
    expect(connectionsFor(1_000)).toBe(64);
    expect(connectionsFor(50_000)).toBe(500);
    expect(connectionsFor(1_000_000)).toBe(2048);
  });
});

describe("agent", () => {
  test("starts only plain ids with an allowed numeric environment", () => {
    expect(startRequest({ id: "actix-web-pr4302", env: { SNDBUF: "65536" } })).toEqual({ id: "actix-web-pr4302", env: { SNDBUF: "65536" } });
    expect(() => startRequest({ id: "../bin/sh" })).toThrow();
    expect(() => startRequest({ id: "axum-0.8.9", env: { LD_PRELOAD: "x" } })).toThrow("not allowed");
    expect(() => startRequest({ id: "axum-0.8.9", env: { SNDBUF: "1; rm" } })).toThrow("not allowed");
  });

  test("shaping paces every flow and restores the default qdisc", () => {
    expect(shapeCommand("ens5", 10)).toEqual(["tc", "qdisc", "replace", "dev", "ens5", "root", "fq", "maxrate", "10mbit"]);
    expect(shapeCommand("ens5", null)).toEqual(["tc", "qdisc", "del", "dev", "ens5", "root"]);
  });

  test("the client's round trip keeps every delayed ACK of 1,000 connections", () => {
    expect(netemCommand("ens5", 40)).toEqual(["tc", "qdisc", "replace", "dev", "ens5", "root", "netem", "delay", "40ms", "limit", "100000"]);
    expect(netemCommand("ens5", null)).toEqual(["tc", "qdisc", "del", "dev", "ens5", "root"]);
  });

  test("stats arrive field by field", () => {
    expect(parseStats({ pid: 7, ticks: 120, rssKb: 9000, hwmKb: 9100, threads: 10, hostBusyTicks: 5, hostTotalTicks: 9, nic: { tx_bytes: 4, bad: "x" } })).toEqual({ pid: 7, ticks: 120, rssKb: 9000, hwmKb: 9100, threads: 10, hostBusyTicks: 5, hostTotalTicks: 9, nic: { tx_bytes: 4 } });
    expect(() => parseStats({ pid: 7 })).toThrow("host ticks");
  });
});

describe("proc", () => {
  test("host ticks leave idle, iowait and interrupt time out of busy", () => {
    expect(hostTicks("cpu  100 2 30 1000 7 5 6 1 0 0\ncpu0 1 1 1 1 1 1 1 1 0 0\n")).toEqual({ busy: 133, total: 1151 });
  });

  test("ethtool keeps the allowance counters", () => {
    expect(parseEthtool("NIC statistics:\n     tx_timeout: 0\n     bw_out_allowance_exceeded: 42\n     pps_allowance_exceeded: 0\n")).toEqual({ bw_out_allowance_exceeded: 42, pps_allowance_exceeded: 0 });
  });
});

describe("run", () => {
  const cs = LANES.change.candidates.map(candidate);

  test("arms rotate each pass and the change lane adds its A/A arm on json only", () => {
    expect(arms(cs, 1, "json", "actix-web-81bb997")).toEqual(["actix-web-81bb997", "actix-web-pr4302", "axum-40d061f", "actix-web-81bb997#aa"]);
    expect(arms(cs, 2, "json", "actix-web-81bb997")).toEqual(["actix-web-pr4302", "axum-40d061f", "actix-web-81bb997#aa", "actix-web-81bb997"]);
    expect(arms(cs, 2, "16k", "actix-web-81bb997")).toEqual(["actix-web-pr4302", "axum-40d061f", "actix-web-81bb997"]);
  });

  test("protocols: six change passes, one pass per framework pair, short smokes", () => {
    expect(protocol("change", "full", false).passes).toBe(6);
    expect(protocol("frameworks", "full", false).passes).toBe(1);
    expect(protocol("change", "smoke", true)).toMatchObject({ passes: 1, stepS: 2 });
    expect(protocol("change", "full", false).cells.map((c) => c.id)).toEqual(["json", "16k", "323k", "323k-fresh", "slow-323k", "slow-323k-fresh", "file"]);
  });

  test("the slow cells share their clients and shaping, which the report captions once", () => {
    for (const mode of ["smoke", "full"] as const) {
      const slow = protocol("change", mode, false).cells.flatMap((c) => (c.kind === "slow" ? [{ ...c, id: "", route: "" }] : []));
      expect(slow.length).toBe(2);
      expect(new Set(slow.map((c) => JSON.stringify(c))).size).toBe(1);
    }
  });

  test("the file cell downloads 64 MiB, and its throughput counts completed responses", () => {
    expect(protocol("change", "full", false).cells.find((c) => c.kind === "bulk")).toMatchObject({ route: "/file", bytes: 67_108_864, connections: 64 });
    expect(gbitPerS({ achievedRps: 93.13225746154785 }, 67_108_864)).toBeCloseTo(50, 6);
  });

  test("cli arguments", () => {
    expect(arg("lane", ["--lane=change", "--local"])).toBe("change");
    expect(arg("local", ["--lane=change", "--local"])).toBe("true");
    expect(arg("candidates", ["--candidates="])).toBe("");
  });
});
