/**
 * Cells and protocols (docs/adr/0001-what-the-benchmark-answers.md, "Cells", "Measurement" and "Local runs").
 * A smoke shortens every step and runs one pass; it checks the harness and never decides a result.
 */
import type { LaneId } from "./candidates";
import type { SearchOptions } from "./capacity";

export type Route = "/json" | "/json-40k" | "/json-323k" | "/16k" | "/323k" | "/323k-fresh" | "/file";

export interface CapacityCell {
  id: "json" | "json-40k" | "json-323k" | "16k" | "323k" | "323k-fresh";
  kind: "capacity";
  route: Route;
  search: SearchOptions;
}

export interface SlowCell {
  id: "slow-323k" | "slow-323k-fresh" | "slow-json-40k" | "slow-json-323k";
  kind: "slow";
  route: "/323k" | "/323k-fresh" | "/json-40k" | "/json-323k";
  connections: number;
  /** On the rig: every flow paced at this rate on the server, and this much delay added on the client. */
  flowRateMbit: number;
  rttMs: number;
  /** Locally, where shaping needs root: the listener's send buffer, which the kernel doubles. */
  localSndbuf: number;
}

/**
 * A large download: keep-alive clients fetching one big response back to back over the unshaped network, for
 * its throughput, CPU and memory. It has no latency target, since one such response alone spends milliseconds
 * on the wire.
 */
export interface BulkCell {
  id: "file";
  kind: "bulk";
  route: "/file";
  connections: number;
  /** The response's size, which the preflight checks against every server's Content-Length. */
  bytes: number;
}

/**
 * The Blacksmith Proof bot's harness, rebuilt on the server instance: wrk over loopback from cores the server
 * doesn't use, closed loop, for its requests per second, latency, CPU and memory.
 */
export interface ProofCell {
  id: "proof-323k" | "proof-323k-wide" | "proof-323k-capped" | "proof-323k-1000" | "proof-323k-fresh-capped" | "proof-json-323k-capped" | "proof-json-40k";
  kind: "proof";
  route: Route;
  connections: number;
  /** wrk's threads, one per CPU it runs on. */
  threads: number;
  /** The CPUs wrk runs on, on the rig; locally the client's CPUs. */
  cpus: string;
  /** The listener's send buffer, which the kernel doubles: 65,536 is the bot's 128 KiB cap. null: the kernel's own. */
  sndbuf: number | null;
}

export type Cell = CapacityCell | SlowCell | BulkCell | ProofCell;

export interface Protocol {
  mode: "smoke" | "full";
  passes: number;
  /** Seconds of unrecorded load before each recorded window. */
  warmupS: number;
  /** Seconds each capacity step records. */
  stepS: number;
  /** The closed-loop cells' (slow and bulk) warm-up and recorded window, in seconds. */
  slowWarmupS: number;
  slowWindowS: number;
  /** The proof cells' warm-up and recorded window: the bot ran `wrk -d8s`. */
  proofWarmupS: number;
  proofWindowS: number;
  /** The change lane measures the base against itself on `json` and on every proof cell, every pass. */
  aaCell: boolean;
  /** A step whose client used more than this share of its CPUs is client-bound. */
  clientBoundAt: number;
  cells: Cell[];
}

/** Open-loop connections for a rate: enough that oha never queues requests for want of one. */
export function connectionsFor(rps: number): number {
  return Math.min(2048, Math.max(64, Math.ceil(rps * 0.01)));
}

/** Cells whose base also runs as its own A/A arm in the change lane: the noise floor next to each reading. */
export function hasAaArm(cell: Pick<Cell, "id" | "kind">): boolean {
  return cell.id === "json" || cell.kind === "proof";
}

export function cells(mode: "smoke" | "full", local: boolean): Cell[] {
  const bisections = mode === "smoke" ? 1 : 3;
  // the rig's 4-vCPU server and the 8 local CPUs start near where earlier runs held, to spend steps near capacity
  const start = local ? { json: 16_000, json40k: 4_000, json323k: 500, b16k: 8_000, b323k: 2_000 } : { json: 32_000, json40k: 4_000, json323k: 500, b16k: 16_000, b323k: 500 };
  const slow = { connections: mode === "smoke" ? 100 : 1_000, flowRateMbit: 10, rttMs: 40, localSndbuf: 65_536 };
  // the bot's wrk: 4 threads on 4 CPUs, 256 connections; the server keeps cores 0-3
  const proof = { connections: 256, threads: 4, cpus: "4-7", sndbuf: null };
  return [
    { id: "json", kind: "capacity", route: "/json", search: { startRps: start.json, maxRps: 2_000_000, minRps: 250, bisections } },
    { id: "16k", kind: "capacity", route: "/16k", search: { startRps: start.b16k, maxRps: 1_000_000, minRps: 250, bisections } },
    { id: "323k", kind: "capacity", route: "/323k", search: { startRps: start.b323k, maxRps: 200_000, minRps: 25, bisections } },
    { id: "323k-fresh", kind: "capacity", route: "/323k-fresh", search: { startRps: start.b323k, maxRps: 200_000, minRps: 25, bisections } },
    { id: "json-40k", kind: "capacity", route: "/json-40k", search: { startRps: start.json40k, maxRps: 1_000_000, minRps: 25, bisections } },
    { id: "json-323k", kind: "capacity", route: "/json-323k", search: { startRps: start.json323k, maxRps: 200_000, minRps: 25, bisections } },
    { id: "slow-323k", kind: "slow", route: "/323k", ...slow },
    { id: "slow-323k-fresh", kind: "slow", route: "/323k-fresh", ...slow },
    { id: "slow-json-40k", kind: "slow", route: "/json-40k", ...slow },
    { id: "slow-json-323k", kind: "slow", route: "/json-323k", ...slow },
    { id: "file", kind: "bulk", route: "/file", connections: 64, bytes: 64 * 1024 * 1024 },
    { id: "proof-323k", kind: "proof", route: "/323k", ...proof },
    { id: "proof-323k-wide", kind: "proof", route: "/323k", ...proof, threads: 8, cpus: "4-11" },
    { id: "proof-323k-capped", kind: "proof", route: "/323k", ...proof, sndbuf: 65_536 },
    { id: "proof-323k-1000", kind: "proof", route: "/323k", ...proof, connections: 1_000 },
    { id: "proof-323k-fresh-capped", kind: "proof", route: "/323k-fresh", ...proof, sndbuf: 65_536 },
    { id: "proof-json-323k-capped", kind: "proof", route: "/json-323k", ...proof, sndbuf: 65_536 },
    { id: "proof-json-40k", kind: "proof", route: "/json-40k", ...proof },
  ];
}

export function protocol(lane: LaneId, mode: "smoke" | "full", local: boolean): Protocol {
  const smoke = mode === "smoke";
  return {
    mode,
    // the framework lane's passes are instance pairs, one per dispatch (ADR 0001, "Passes")
    passes: smoke ? 1 : lane === "change" ? 6 : 1,
    warmupS: smoke ? 1 : 3,
    stepS: smoke ? 2 : 7,
    slowWarmupS: smoke ? 3 : 10,
    slowWindowS: smoke ? 5 : 30,
    proofWarmupS: smoke ? 1 : 2,
    proofWindowS: smoke ? 3 : 8,
    aaCell: lane === "change",
    clientBoundAt: 0.8,
    // the proof cells answer a pull request's Proof run, so only the change lane runs them
    cells: cells(mode, local).filter((c) => c.kind !== "proof" || lane === "change"),
  };
}
