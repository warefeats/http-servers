/** Readers for /proc and the NIC's counters, shared by the agent and the local runner. */
import { readdirSync, readFileSync } from "node:fs";

/** USER_HZ on Linux. */
export const HZ = 100;

/** A process's user plus system time in clock ticks, every thread included, or null once it is gone. */
export function processTicks(pid: number): number | null {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
    // the command name may hold spaces and parentheses; the fields after its closing parenthesis do not
    const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
    const utime = Number(fields[11]);
    const stime = Number(fields[12]);
    return Number.isFinite(utime) && Number.isFinite(stime) ? utime + stime : null;
  } catch {
    return null;
  }
}

export interface Memory {
  rssKb: number;
  hwmKb: number;
  threads: number;
}

export function processMemory(pid: number): Memory | null {
  try {
    const status = readFileSync(`/proc/${pid}/status`, "utf8");
    const field = (name: string) => Number(status.match(new RegExp(`^${name}:\\s+(\\d+)`, "m"))?.[1] ?? Number.NaN);
    const m = { rssKb: field("VmRSS"), hwmKb: field("VmHWM"), threads: field("Threads") };
    return Number.isFinite(m.rssKb) && Number.isFinite(m.hwmKb) ? m : null;
  } catch {
    return null;
  }
}

/** The fields of /proc/<pid>/stat after the command name, which may hold spaces and parentheses. */
export function statFields(stat: string): string[] {
  return stat.slice(stat.lastIndexOf(")") + 2).split(" ");
}

/** The pids in a process group: a server's leader and every worker it started, threads counted within each. */
export function groupPids(pgid: number): number[] {
  const out: number[] = [];
  for (const name of readdirSync("/proc")) {
    if (!/^\d+$/.test(name)) continue;
    try {
      // field 5 of stat, the process group, is index 2 after the command name
      if (Number(statFields(readFileSync(`/proc/${name}/stat`, "utf8"))[2]) === pgid) out.push(Number(name));
    } catch {
      // gone between the listing and the read
    }
  }
  return out;
}

/**
 * A process group's CPU time in clock ticks: every live member's user plus system time, plus the time of the
 * children each has reaped, so a worker that exited and was waited for still counts. Null when the group is gone.
 */
export function groupTicks(pgid: number): number | null {
  let total = 0;
  let any = false;
  for (const pid of groupPids(pgid)) {
    try {
      const f = statFields(readFileSync(`/proc/${pid}/stat`, "utf8"));
      const t = Number(f[11]) + Number(f[12]) + Number(f[13]) + Number(f[14]);
      if (Number.isFinite(t)) {
        total += t;
        any = true;
      }
    } catch {
      // gone
    }
  }
  return any ? total : null;
}

/**
 * A process group's memory: the sum over its members of resident set and peak resident set, and their threads. For
 * one process it is that process's own; for several, the peak is the sum of each one's peak.
 */
export function groupMemory(pgid: number): Memory | null {
  let m: Memory | null = null;
  for (const pid of groupPids(pgid)) {
    const one = processMemory(pid);
    if (!one) continue;
    m = m === null ? { ...one } : { rssKb: m.rssKb + one.rssKb, hwmKb: m.hwmKb + one.hwmKb, threads: m.threads + one.threads };
  }
  return m;
}

export interface HostTicks {
  /** user + nice + system + steal; interrupt time is left out of every side. */
  busy: number;
  total: number;
}

export function hostTicks(statText: string = readFileSync("/proc/stat", "utf8")): HostTicks {
  const line = statText.split("\n").find((l) => l.startsWith("cpu "));
  if (!line) throw new Error("no cpu line in /proc/stat");
  const v = line.trim().split(/\s+/).slice(1).map(Number);
  const at = (i: number) => v[i] ?? 0;
  const busy = at(0) + at(1) + at(2) + at(7);
  return { busy, total: v.slice(0, 8).reduce((a, b) => a + b, 0) };
}

/** The ENA counters that say a window hit the instance's network allowance, plus bytes sent. */
export const NIC_COUNTERS = ["bw_in_allowance_exceeded", "bw_out_allowance_exceeded", "pps_allowance_exceeded", "conntrack_allowance_exceeded", "linklocal_allowance_exceeded"];

export function parseEthtool(text: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*([a-z_]+):\s+(\d+)\s*$/);
    if (m?.[1] && m[2] && NIC_COUNTERS.includes(m[1])) out[m[1]] = Number(m[2]);
  }
  return out;
}

export function nicCounters(nic: string | null): Record<string, number> {
  if (!nic) return {};
  const out: Record<string, number> = {};
  const eth = Bun.spawnSync({ cmd: ["ethtool", "-S", nic], stdout: "pipe", stderr: "pipe" });
  if (eth.exitCode === 0) Object.assign(out, parseEthtool(eth.stdout.toString()));
  try {
    out["tx_bytes"] = Number(readFileSync(`/sys/class/net/${nic}/statistics/tx_bytes`, "utf8").trim());
  } catch {
    // no such interface
  }
  return out;
}

/** The interface of the default route, for `--nic=auto`. */
export function defaultNic(): string | null {
  const r = Bun.spawnSync({ cmd: ["ip", "-o", "-4", "route", "show", "to", "default"], stdout: "pipe", stderr: "pipe" });
  const m = r.stdout.toString().match(/\bdev\s+(\S+)/);
  return m?.[1] ?? null;
}

export function resolveNic(spec: string | undefined): string | null {
  if (spec === undefined || spec === "none" || spec === "") return null;
  return spec === "auto" ? defaultNic() : spec;
}
