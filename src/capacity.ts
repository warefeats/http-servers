/**
 * Capacity (docs/adr/0001-what-the-benchmark-answers.md, "Measurement"): the highest offered rate a server
 * holds with p99 at most the target, fewer than 0.1% errors and at least 95% of the rate delivered. The rate
 * doubles until a step fails, then bisects between the last held rate and the first failed one. Adapted from
 * map-tile-servers' archive lane (src/lane/capacity.ts).
 */

export interface StepOutcome {
  offeredRps: number;
  achievedRps: number;
  p99Ms: number | null;
  errorRate: number;
  held: boolean;
}

export interface HoldRule {
  p99Ms: number;
  maxErrorRate: number;
  minDelivered: number;
}

export const HOLD: HoldRule = { p99Ms: 50, maxErrorRate: 0.001, minDelivered: 0.95 };

export function held(offeredRps: number, achievedRps: number, p99Ms: number | null, errorRate: number, rule: HoldRule = HOLD): boolean {
  return p99Ms !== null && p99Ms <= rule.p99Ms && errorRate <= rule.maxErrorRate && achievedRps >= rule.minDelivered * offeredRps;
}

export interface SearchOptions {
  startRps: number;
  /** Stop doubling here; a server that holds it is reported as at least this. */
  maxRps: number;
  /** Below this, a server that holds nothing is reported as 0. */
  minRps: number;
  bisections: number;
}

export interface Capacity<S extends StepOutcome> {
  capacityRps: number;
  /** The search stopped at maxRps without a failed step. */
  atCeiling: boolean;
  steps: S[];
}

export async function findCapacity<S extends StepOutcome>(probe: (rps: number) => Promise<S>, o: SearchOptions): Promise<Capacity<S>> {
  const steps: S[] = [];
  const at = async (rps: number) => {
    const s = await probe(rps);
    steps.push(s);
    return s.held;
  };
  let lo = 0;
  let hi = 0;
  if (await at(o.startRps)) {
    lo = o.startRps;
    for (let rps = o.startRps * 2; ; rps *= 2) {
      if (rps > o.maxRps) return { capacityRps: lo, atCeiling: true, steps };
      if (!(await at(rps))) {
        hi = rps;
        break;
      }
      lo = rps;
    }
  } else {
    hi = o.startRps;
    for (let rps = Math.floor(o.startRps / 2); ; rps = Math.floor(rps / 2)) {
      if (rps < o.minRps) return { capacityRps: 0, atCeiling: false, steps };
      if (await at(rps)) {
        lo = rps;
        break;
      }
      hi = rps;
    }
  }
  for (let i = 0; i < o.bisections; i++) {
    const mid = Math.round((lo + hi) / 2);
    if (mid <= lo || mid >= hi) break;
    if (await at(mid)) lo = mid;
    else hi = mid;
  }
  return { capacityRps: lo, atCeiling: false, steps };
}

/** The highest rate every search held among the rates they all probed: where the change lane compares cost and latency. */
export function highestCommonHeld(searches: readonly (readonly StepOutcome[])[]): number | null {
  const heldSets = searches.map((steps) => new Set(steps.filter((s) => s.held).map((s) => s.offeredRps)));
  const first = heldSets[0];
  if (!first) return null;
  const common = [...first].filter((r) => heldSets.every((set) => set.has(r)));
  return common.length === 0 ? null : Math.max(...common);
}
