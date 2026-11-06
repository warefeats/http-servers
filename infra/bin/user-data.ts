/**
 * Writes each launch template's user data, exactly as the synthesized stack carries it, to <dir>/server.sh and
 * <dir>/client.sh, for scripts/rig-walk.sh to shellcheck and replay. Synthesis is offline (lib/template.ts).
 *   bun run bin/user-data.ts <dir>
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { launchTemplates, roleTemplate, synthesize } from "../lib/template.js";

const dir = process.argv[2];
if (!dir) {
  console.error("usage: bun run bin/user-data.ts <dir>");
  process.exit(2);
}
mkdirSync(dir, { recursive: true });
const lts = launchTemplates(synthesize().toJSON());
for (const role of ["server", "client"] as const) {
  const lt = roleTemplate(lts, role);
  writeFileSync(join(dir, `${role}.sh`), lt.userData.endsWith("\n") ? lt.userData : `${lt.userData}\n`);
  console.log(`${role}: ${lt.logicalId}, ${lt.instanceType}`);
}
