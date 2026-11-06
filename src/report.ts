/**
 * The report (docs/adr/0001-what-the-benchmark-answers.md, "Result"): medians per candidate, and for the change
 * lane the head-to-base ratio of every measure with a bootstrap interval over the paired passes, the A/A
 * interval beside them. Several run files (one per instance pair) combine into one report.
 *   bun run src/report.ts results/<run>/results.json [more.json ...]
 */
import { readFileSync } from "node:fs";
import { highestCommonHeld } from "./capacity";
import type { StepRecord } from "./measure";
import type { CellRecord, RunFile } from "./run";
import { bootstrapMedian, type Interval, median, tInterval, verdict } from "./stats";

const fmt = (n: number | null | undefined, digits = 0) => (n === null || n === undefined || !Number.isFinite(n) ? "–" : n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits }));
const ratio = (i: Interval) => (Number.isFinite(i.estimate) ? `${i.estimate.toFixed(3)} (${i.lo.toFixed(3)}–${i.hi.toFixed(3)})` : "–");

interface Sample {
  key: string;
  rec: CellRecord;
}

function samples(runs: readonly RunFile[], cell: string, arm: string): Sample[] {
  return runs.flatMap((run, i) => run.cells.filter((c) => c.cell === cell && c.arm === arm && !c.error).map((rec) => ({ key: `${i}:${rec.pass}`, rec })));
}

function stepAt(rec: CellRecord, rps: number): StepRecord | undefined {
  return rec.capacity?.steps.find((s) => s.offeredRps === rps);
}

/** The highest held step of one search. */
function top(rec: CellRecord): StepRecord | undefined {
  const heldSteps = rec.capacity?.steps.filter((s) => s.held) ?? [];
  return heldSteps.reduce<StepRecord | undefined>((best, s) => (!best || s.offeredRps > best.offeredRps ? s : best), undefined);
}

function pairedRatios(runs: readonly RunFile[], cell: string, headArm: string, baseArm: string, measure: (head: CellRecord, base: CellRecord) => [number | null, number | null]): number[] {
  const base = new Map(samples(runs, cell, baseArm).map((s) => [s.key, s.rec]));
  return samples(runs, cell, headArm).flatMap(({ key, rec }) => {
    const b = base.get(key);
    if (!b) return [];
    const [h, bb] = measure(rec, b);
    return h !== null && bb !== null && bb !== 0 ? [h / bb] : [];
  });
}

const capacityOf = (r: CellRecord) => r.capacity?.capacityRps ?? null;

/** CPU per response and p99 at the highest rate both searches held. */
function atCommon(pick: (s: StepRecord) => number | null) {
  return (h: CellRecord, b: CellRecord): [number | null, number | null] => {
    const rate = highestCommonHeld([h.capacity?.steps ?? [], b.capacity?.steps ?? []]);
    if (rate === null) return [null, null];
    const hs = stepAt(h, rate);
    const bs = stepAt(b, rate);
    return [hs ? pick(hs) : null, bs ? pick(bs) : null];
  };
}

export function renderReport(runs: readonly RunFile[]): string {
  const first = runs[0];
  if (!first) return "no runs\n";
  const lines: string[] = [];
  const labels = new Map(first.candidates.map((c) => [c.id, c.label]));
  const label = (arm: string) => (arm.endsWith("#aa") ? `${labels.get(arm.slice(0, -3)) ?? arm} (A/A)` : (labels.get(arm) ?? arm));
  const passes = runs.reduce((n, r) => n + Math.max(0, ...r.cells.map((c) => c.pass)), 0);
  const capCells = first.protocol.cells.filter((c) => c.kind === "capacity").map((c) => c.id);
  const armIds = [...new Set(runs.flatMap((r) => r.cells.map((c) => c.arm)))];

  lines.push(`# ${first.lane} lane, ${first.mode}${first.local ? ", local" : ""}: ${first.candidates.map((c) => c.label).join(", ")}`, "");
  if (first.mode === "smoke") lines.push("A smoke checks the harness: one short pass, so it decides nothing (ADR 0001).", "");

  if (capCells.length > 0) {
    lines.push("Capacity at p99 ≤ 50 ms with at most 0.1% errors and ≥ 95% delivered; CPU and p99 at each server's highest held rate:", "");
    lines.push("| Route | Server | Capacity (responses/s) | CPU (µs/response) | p99 (ms) | Peak memory growth (MB) |", "| :-- | :-- | --: | --: | --: | --: |");
    for (const cell of capCells) {
      let firstRow = true;
      for (const arm of armIds) {
        const ss = samples(runs, cell, arm);
        if (ss.length === 0) continue;
        const caps = ss.flatMap((s) => (s.rec.capacity ? [s.rec.capacity.capacityRps] : []));
        const tops = ss.flatMap((s) => { const t = top(s.rec); return t ? [t] : []; });
        const cap = first.lane === "frameworks" && caps.length >= 2 ? tInterval(caps).estimate : median(caps);
        const marks = [ss.some((s) => s.rec.capacity?.atCeiling) ? "search ceiling" : "", ss.some((s) => s.rec.capacity?.floor) ? "client-bound" : ""].filter(Boolean).join(", ");
        lines.push(`| ${firstRow ? `\`/${cell}\`` : ""} | ${label(arm)}${marks ? ` (${marks})` : ""} | ${fmt(cap)} | ${fmt(median(tops.flatMap((t) => (t.window.usPerResponse === null ? [] : [t.window.usPerResponse]))), 1)} | ${fmt(median(tops.flatMap((t) => (t.p99Ms === null ? [] : [t.p99Ms]))), 2)} | ${fmt(median(ss.flatMap((s) => (s.rec.peakGrowthMb === null ? [] : [s.rec.peakGrowthMb]))), 1)} |`);
        firstRow = false;
      }
    }
    lines.push("");
  }

  const slow = first.protocol.cells.find((c) => c.kind === "slow");
  if (slow && slow.kind === "slow") {
    const how = first.local ? `the listener's send buffer capped at ${(slow.localSndbuf * 2) / 1024} KiB` : `each flow paced at ${slow.flowRateMbit} Mbit/s with ${slow.rttMs} ms added round trip`;
    lines.push(`Slow clients: ${fmt(slow.connections)} keep-alive clients fetching \`/323k\` back to back, ${how}:`, "");
    lines.push("| Server | Responses/s | p50 (ms) | p99 (ms) | CPU (µs/response) | Peak memory growth (MB) |", "| :-- | --: | --: | --: | --: | --: |");
    for (const arm of armIds) {
      const ws = samples(runs, slow.id, arm).flatMap((s) => (s.rec.slow ? [{ w: s.rec.slow, g: s.rec.peakGrowthMb }] : []));
      if (ws.length === 0) continue;
      const m = (f: (x: (typeof ws)[number]) => number | null) => median(ws.flatMap((x) => { const v = f(x); return v === null ? [] : [v]; }));
      lines.push(`| ${label(arm)} | ${fmt(m((x) => x.w.achievedRps))} | ${fmt(m((x) => x.w.oha.p50Ms), 1)} | ${fmt(m((x) => x.w.oha.p99Ms), 1)} | ${fmt(m((x) => x.w.usPerResponse), 1)} | ${fmt(m((x) => x.g), 1)} |`);
    }
    lines.push("");
  }

  if (first.lane === "change" && first.pair) {
    const { base, head } = first.pair;
    lines.push(`${label(head)} against ${label(base)}: ratio of head to base, median over paired passes with its 95% bootstrap interval. Higher is better for capacity, lower for the rest:`, "");
    lines.push("| Route | Capacity | CPU per response | p99 | Peak memory growth | Reading |", "| :-- | --: | --: | --: | --: | :-- |");
    const growth = (h: CellRecord, b: CellRecord): [number | null, number | null] => [h.peakGrowthMb, b.peakGrowthMb];
    for (const cell of capCells) {
      const cap = bootstrapMedian(pairedRatios(runs, cell, head, base, (h, b) => [capacityOf(h), capacityOf(b)]));
      const cpu = bootstrapMedian(pairedRatios(runs, cell, head, base, atCommon((s) => s.window.usPerResponse)));
      const p99 = bootstrapMedian(pairedRatios(runs, cell, head, base, atCommon((s) => s.p99Ms)));
      const mem = bootstrapMedian(pairedRatios(runs, cell, head, base, growth));
      const readings = [`capacity ${verdict(cap, true)}`, `CPU ${verdict(cpu, false)}`, `p99 ${verdict(p99, false)}`, `memory ${verdict(mem, false)}`];
      lines.push(`| \`/${cell}\` | ${ratio(cap)} | ${ratio(cpu)} | ${ratio(p99)} | ${ratio(mem)} | ${readings.join("; ")} |`);
    }
    if (slow) {
      const cpu = bootstrapMedian(pairedRatios(runs, slow.id, head, base, (h, b) => [h.slow?.usPerResponse ?? null, b.slow?.usPerResponse ?? null]));
      const p99 = bootstrapMedian(pairedRatios(runs, slow.id, head, base, (h, b) => [h.slow?.oha.p99Ms ?? null, b.slow?.oha.p99Ms ?? null]));
      const mem = bootstrapMedian(pairedRatios(runs, slow.id, head, base, growth));
      lines.push(`| slow \`/323k\` | – | ${ratio(cpu)} | ${ratio(p99)} | ${ratio(mem)} | CPU ${verdict(cpu, false)}; p99 ${verdict(p99, false)}; memory ${verdict(mem, false)} |`);
    }
    const aa = bootstrapMedian(pairedRatios(runs, "json", `${base}#aa`, base, (h, b) => [capacityOf(h), capacityOf(b)]));
    const aaCpu = bootstrapMedian(pairedRatios(runs, "json", `${base}#aa`, base, atCommon((s) => s.window.usPerResponse)));
    if (aa.n > 0) lines.push(`| A/A \`/json\` | ${ratio(aa)} | ${ratio(aaCpu)} | – | – | the base against itself: the noise floor |`);
    lines.push("");
  }

  const failed = runs.flatMap((r) => r.cells.filter((c) => c.error));
  if (failed.length > 0) lines.push(`Failed cells: ${failed.map((c) => `pass ${c.pass} ${c.cell} ${c.arm}: ${c.error}`).join("; ")}`, "");
  const other = runs.flatMap((r) => r.cells.flatMap((c) => [...(c.capacity?.steps.map((s) => s.window.otherCpus) ?? []), c.slow?.otherCpus ?? null])).filter((x): x is number => x !== null);
  const host = first.host;
  lines.push(`${passes} pass(es)${runs.length > 1 ? ` over ${runs.length} instance pairs` : ""}; within a cell the servers ran back to back in an order that rotated each pass, a fresh server process per cell; open-loop load from ${host["ohaProcesses"] ?? "one"} oha processes (${host["oha"] ?? "oha"}) with its latency correction, each percentile the highest any process saw, ${first.protocol.stepS} s recorded per step after ${first.protocol.warmupS} s of warm-up; CPU is the server process's user plus system time. ${first.local ? `Local: server on CPUs ${host["serverCpus"]}, oha on ${host["clientCpus"]}, over loopback, on ${host["hostname"]} (${host["kernel"]}); other work on the host peaked at ${fmt(Math.max(0, ...other), 1)} CPUs during a recorded window.` : `Rig: ${host["hostname"] ?? ""}.`}`);
  return `${lines.join("\n")}\n`;
}

function isRunFile(v: unknown): v is RunFile {
  return typeof v === "object" && v !== null && "schema" in v && v.schema === 1 && "cells" in v && Array.isArray(v.cells);
}

if (import.meta.main) {
  const runs = process.argv.slice(2).map((path) => {
    const v: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (!isRunFile(v)) throw new Error(`${path} is not a run file`);
    return v;
  });
  process.stdout.write(renderReport(runs));
}
