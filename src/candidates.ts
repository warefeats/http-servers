/**
 * The candidates and the two lanes (docs/adr/0001-what-the-benchmark-answers.md, "Two lanes" and "Builds").
 * A candidate is one framework at one source: an exact crates.io release, or a git commit whose workspace
 * crates are all taken from that commit.
 */

export type Framework = "actix-web" | "axum";

export type Source = { kind: "crates"; version: string } | { kind: "git"; repo: string; rev: string };

export interface Candidate {
  id: string;
  framework: Framework;
  /** How tables and logs name it. */
  label: string;
  source: Source;
}

export type LaneId = "frameworks" | "change";

export interface Lane {
  id: LaneId;
  /** The candidates a run measures when none are named. */
  candidates: readonly string[];
  /** The change lane's base and head: the two sides every ratio compares, and the pair that shares a lockfile. */
  pair?: { base: string; head: string };
}

export const CANDIDATES: readonly Candidate[] = [
  { id: "actix-web-4.18.1", framework: "actix-web", label: "actix-web 4.18.1", source: { kind: "crates", version: "4.18.1" } },
  { id: "actix-web-4.18.2", framework: "actix-web", label: "actix-web 4.18.2", source: { kind: "crates", version: "4.18.2" } },
  { id: "axum-0.8.9", framework: "axum", label: "axum 0.8.9", source: { kind: "crates", version: "0.8.9" } },
  {
    id: "actix-web-81bb997",
    framework: "actix-web",
    label: "actix-web main 81bb997",
    source: { kind: "git", repo: "https://github.com/actix/actix-web", rev: "81bb9971ed888b9194cefb5c5d7b093a97de10c2" },
  },
  {
    id: "actix-web-pr4302",
    framework: "actix-web",
    label: "actix-web #4302 2a3f201",
    source: { kind: "git", repo: "https://github.com/johncarmack1984/actix-web", rev: "2a3f2019d2be1ecbd005916135c0b69a74cf2038" },
  },
  {
    id: "actix-web-9fb5964",
    framework: "actix-web",
    label: "actix-web main 9fb5964",
    source: { kind: "git", repo: "https://github.com/actix/actix-web", rev: "9fb59640aebc6a7c87bb79ead55b5730a5425ba4" },
  },
  {
    id: "actix-web-pr4302-c2829f9",
    framework: "actix-web",
    label: "actix-web #4302 with fixes c2829f9",
    source: { kind: "git", repo: "https://github.com/johncarmack1984/actix-web", rev: "c2829f952b05046f8db0daf16dc0b44e09c566b6" },
  },
  {
    id: "actix-web-pr4302-2195876",
    framework: "actix-web",
    label: "actix-web #4302 with fixes 2195876",
    source: { kind: "git", repo: "https://github.com/johncarmack1984/actix-web", rev: "21958769ebba90638142b8aaa33e504e9b6bc694" },
  },
  {
    id: "axum-40d061f",
    framework: "axum",
    label: "axum main 40d061f",
    source: { kind: "git", repo: "https://github.com/tokio-rs/axum", rev: "40d061fdacd468217c7a609bede16357276b6c40" },
  },
];

export const LANES: Record<LaneId, Lane> = {
  frameworks: { id: "frameworks", candidates: ["actix-web-4.18.2", "axum-0.8.9"] },
  // the second change run: #4302 with its fixes against the main it now merges into, axum left out to keep six
  // passes inside the budget (ADR 0001, "Cells" and "Budget")
  change: {
    id: "change",
    candidates: ["actix-web-9fb5964", "actix-web-pr4302-2195876"],
    pair: { base: "actix-web-9fb5964", head: "actix-web-pr4302-2195876" },
  },
};

/**
 * The crates of a framework's workspace that a git candidate must take from its commit. actix-web's own
 * crates depend on each other by crates.io version, actix-files on actix-web itself, so each needs a patch;
 * axum's reach axum-core by path inside the same checkout, so none do.
 */
export const WORKSPACE_CRATES: Record<Framework, readonly string[]> = {
  "actix-web": ["actix-web", "actix-http", "actix-router", "actix-web-codegen", "actix-files"],
  axum: [],
};

export function candidate(id: string): Candidate {
  const c = CANDIDATES.find((x) => x.id === id);
  if (!c) throw new Error(`unknown candidate ${id}; known: ${CANDIDATES.map((x) => x.id).join(", ")}`);
  return c;
}

export function isLane(value: string): value is LaneId {
  return value === "frameworks" || value === "change";
}

/** The candidates a run measures: the named ones, or the lane's own. */
export function planCandidates(lane: Lane, named: string): Candidate[] {
  const ids = named.trim() === "" ? lane.candidates : named.split(",").map((s) => s.trim()).filter(Boolean);
  const out = ids.map(candidate);
  if (new Set(out.map((c) => c.id)).size !== out.length) throw new Error(`a candidate is named twice: ${ids.join(",")}`);
  return out;
}

/** The framework dependency line and the [patch] table of a candidate's generated manifest. */
export function manifestParts(c: Candidate): { framework: string; patch: string } {
  if (c.source.kind === "crates") return { framework: `${c.framework} = "=${c.source.version}"`, patch: "" };
  const at = `git = "${c.source.repo}", rev = "${c.source.rev}"`;
  const crates = WORKSPACE_CRATES[c.framework];
  return {
    framework: `${c.framework} = { ${at} }`,
    patch: crates.length === 0 ? "" : ["[patch.crates-io]", ...crates.map((name) => `${name} = { ${at} }`)].join("\n"),
  };
}

/** Fills a server's Cargo.toml.in for one candidate. */
export function renderManifest(template: string, c: Candidate, commonPath: string): string {
  const { framework, patch } = manifestParts(c);
  // markers are whole lines (or a quoted path), so prose about them can never be rewritten
  const fill: [RegExp, string][] = [
    [/^@FRAMEWORK@$/m, framework],
    [/"@COMMON@"/, JSON.stringify(commonPath)],
    [/^@PATCH@$/m, patch],
  ];
  return fill.reduce((text, [marker, value]) => {
    if (!marker.test(text)) throw new Error(`template lacks ${marker.source}`);
    return text.replace(marker, () => value);
  }, template);
}
