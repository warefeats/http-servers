/**
 * Writes each launch template's user data, exactly as the synthesized stack carries it, to <dir>/server.sh and
 * <dir>/client.sh, for scripts/rig-walk.sh to shellcheck and replay. Synthesis is offline (lib/template.ts).
 *   bun run bin/user-data.ts <dir>
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CLIENT_TYPE, SERVER_TYPE } from "../lib/http-servers-bench-stack.js";
import { launchTemplates, synthesize } from "../lib/template.js";

const dir = process.argv[2];
if (!dir) {
  console.error("usage: bun run bin/user-data.ts <dir>");
  process.exit(2);
}
mkdirSync(dir, { recursive: true });
const lts = launchTemplates(synthesize().toJSON());
for (const [role, instanceType] of [
  ["server", SERVER_TYPE],
  ["client", CLIENT_TYPE],
]) {
  const lt = lts.find((t) => t.instanceType === instanceType);
  if (!lt) throw new Error(`no launch template for the ${role} (${instanceType})`);
  writeFileSync(join(dir, `${role}.sh`), lt.userData.endsWith("\n") ? lt.userData : `${lt.userData}\n`);
  console.log(`${role}: ${lt.logicalId}, ${instanceType}`);
}
