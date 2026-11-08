// Bun bench server (docs/adr/0001-what-the-benchmark-answers.md, "The servers"), run the way Bun's guide runs
// Bun.serve on several cores: one process per CPU, each serving the same port with reusePort, at Bun's defaults.
import { join } from "node:path";

// hardwareConcurrency counts the CPUs the process may run on, the 4 the agent pins it to
const servers = Array.from({ length: navigator.hardwareConcurrency }, () =>
  Bun.spawn({ cmd: [process.execPath, join(import.meta.dir, "server.ts")], stdout: "inherit", stderr: "inherit", stdin: "inherit" }),
);

function kill(): void {
  for (const s of servers) s.kill();
}

process.on("SIGINT", kill);
process.on("SIGTERM", kill);
process.on("exit", kill);
