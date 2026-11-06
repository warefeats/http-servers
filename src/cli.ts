/** `--name=value` arguments; a bare `--name` reads as "true". */
export function arg(name: string, argv: readonly string[] = process.argv.slice(2)): string | undefined {
  for (const a of argv) {
    if (a === `--${name}`) return "true";
    if (a.startsWith(`--${name}=`)) return a.slice(name.length + 3);
  }
  return undefined;
}

export function numberArg(name: string, fallback: number, argv?: readonly string[]): number {
  const raw = arg(name, argv);
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`--${name} must be a number, not ${raw}`);
  return n;
}
