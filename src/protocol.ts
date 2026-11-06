/**
 * Cells and protocols (docs/adr/0001-what-the-benchmark-answers.md, "Cells", "Measurement" and "Local runs").
 * A smoke shortens every step and runs one pass; it checks the harness and never decides a result.
 */
import type { LaneId } from "./candidates";
import type { SearchOptions } from "./capacity";

export type Route = "/json" | "/16k" | "/323k";

export interface CapacityCell {
  id: "json" | "16k" | "323k";
  kind: "capacity";
  route: Route;
  search: SearchOptions;
}

export interface SlowCell {
  id: "slow-323k";
  kind: "slow";
  route: "/323k";
  connections: number;
  /** On the rig: every flow paced at this rate on the server, and this much delay added on the client. */
  flowRateMbit: number;
  rttMs: number;
  /** Locally, where shaping needs root: the listener's send buffer, which the kernel doubles. */
  localSndbuf: number;
}

export type Cell = CapacityCell | SlowCell;

export interface Protocol {
  mode: "smoke" | "full";
  passes: number;
  /** Seconds of unrecorded load before each recorded window. */
  warmupS: number;
  /** Seconds each capacity step records. */
  stepS: number;
  slowWarmupS: number;
  slowWindowS: number;
  /** The change lane measures the base against itself on `json` every pass. */
  aaCell: boolean;
  /** A step whose client used more than this share of its CPUs is client-bound. */
  clientBoundAt: number;
  cells: Cell[];
}

/** Open-loop connections for a rate: enough that oha never queues requests for want of one. */
export function connectionsFor(rps: number): number {
  return Math.min(2048, Math.max(64, Math.ceil(rps * 0.01)));
}

export function cells(mode: "smoke" | "full", local: boolean): Cell[] {
  const bisections = mode === "smoke" ? 1 : 3;
  // the rig's 4-vCPU server and the 8 local CPUs start near where earlier runs held, to spend steps near capacity
  const start = local ? { json: 16_000, b16k: 8_000, b323k: 2_000 } : { json: 32_000, b16k: 16_000, b323k: 500 };
  return [
    { id: "json", kind: "capacity", route: "/json", search: { startRps: start.json, maxRps: 2_000_000, minRps: 250, bisections } },
    { id: "16k", kind: "capacity", route: "/16k", search: { startRps: start.b16k, maxRps: 1_000_000, minRps: 250, bisections } },
    { id: "323k", kind: "capacity", route: "/323k", search: { startRps: start.b323k, maxRps: 200_000, minRps: 25, bisections } },
    { id: "slow-323k", kind: "slow", route: "/323k", connections: mode === "smoke" ? 100 : 1_000, flowRateMbit: 10, rttMs: 40, localSndbuf: 65_536 },
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
    aaCell: lane === "change",
    clientBoundAt: 0.8,
    cells: cells(mode, local),
  };
}
