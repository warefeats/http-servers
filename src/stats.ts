/** The statistics the report uses (docs/adr/0001-what-the-benchmark-answers.md, "Result"). */

export function median(xs: readonly number[]): number {
  if (xs.length === 0) return Number.NaN;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  const hi = s[mid] ?? Number.NaN;
  return s.length % 2 === 1 ? hi : ((s[mid - 1] ?? Number.NaN) + hi) / 2;
}

export function mean(xs: readonly number[]): number {
  return xs.length === 0 ? Number.NaN : xs.reduce((a, b) => a + b, 0) / xs.length;
}

/** A small deterministic generator, so a report reads the same every time it is made. */
export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Interval {
  estimate: number;
  lo: number;
  hi: number;
  n: number;
}

/** Percentile bootstrap interval of the median (10,000 resamples, fixed seed). */
export function bootstrapMedian(xs: readonly number[], level = 0.95, resamples = 10_000, seed = 4302): Interval {
  const n = xs.length;
  if (n === 0) return { estimate: Number.NaN, lo: Number.NaN, hi: Number.NaN, n };
  const next = rng(seed);
  const meds: number[] = [];
  const sample: number[] = new Array(n);
  for (let r = 0; r < resamples; r++) {
    for (let i = 0; i < n; i++) sample[i] = xs[Math.floor(next() * n)] ?? Number.NaN;
    meds.push(median(sample));
  }
  meds.sort((a, b) => a - b);
  const q = (p: number) => meds[Math.min(meds.length - 1, Math.max(0, Math.floor(p * meds.length)))] ?? Number.NaN;
  return { estimate: median(xs), lo: q((1 - level) / 2), hi: q(1 - (1 - level) / 2), n };
}

const T975: Record<number, number> = { 1: 12.706, 2: 4.303, 3: 3.182, 4: 2.776, 5: 2.571, 6: 2.447, 7: 2.365, 8: 2.306, 9: 2.262, 10: 2.228 };

/** Student-t interval of the mean, for the framework lane's three instance pairs. */
export function tInterval(xs: readonly number[]): Interval {
  const n = xs.length;
  const m = mean(xs);
  if (n < 2) return { estimate: m, lo: Number.NaN, hi: Number.NaN, n };
  const sd = Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (n - 1));
  const half = (T975[n - 1] ?? 1.96) * (sd / Math.sqrt(n));
  return { estimate: m, lo: m - half, hi: m + half, n };
}

/** Two intervals that share any value are a tie. */
export function overlaps(a: Interval, b: Interval): boolean {
  return !(a.hi < b.lo || b.hi < a.lo);
}

/** Fewer paired passes than this read nothing: a smoke never decides a result (ADR 0001, "Result"). */
export const MIN_PASSES = 3;

/** "no measurable change" when the interval of a ratio contains 1. */
export function verdict(ratio: Interval, higherIsBetter: boolean): "no measurable change" | "better" | "worse" | "too few passes" {
  if (ratio.n < MIN_PASSES || !Number.isFinite(ratio.lo) || !Number.isFinite(ratio.hi)) return "too few passes";
  if (ratio.lo <= 1 && ratio.hi >= 1) return "no measurable change";
  const above = ratio.lo > 1;
  return above === higherIsBetter ? "better" : "worse";
}
