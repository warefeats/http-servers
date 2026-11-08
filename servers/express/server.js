// Express bench server (docs/adr/0001-what-the-benchmark-answers.md, "The servers"), run the way Express's
// production best-practices guide runs one: a worker per CPU through Node's cluster module, each an Express app
// at Express's defaults. The 64 MiB file goes through res.sendFile, the way Express's docs send one.
import cluster from "node:cluster";
import { availableParallelism } from "node:os";
import { join } from "node:path";
import express from "express";

if (cluster.isPrimary) {
  // availableParallelism counts the CPUs the process may run on, the 4 the agent pins it to
  for (let i = 0; i < availableParallelism(); i++) cluster.fork();
} else {
  const TAGS = ["outdoor", "steel", "refurbished", "bulk", "eco", "imported"];

  /** A page of `items` items, built on every request, as servers/common builds it. */
  const catalog = (items) => ({
    page: 1,
    per_page: items,
    total: 30 * items,
    items: Array.from({ length: items }, (_, i) => ({
      id: 10_000 + i,
      sku: `WF-${String(31_337 + i * 17).padStart(5, "0")}-${i % 3}`,
      name: `Item number ${i + 1} of the bench catalog`,
      tags: TAGS.slice(i % 3, (i % 3) + 3),
      price_cents: 1_999 + i * 250,
      in_stock: i % 4 !== 0,
    })),
  });

  /** Byte `i % 251` at offset `i`, as every server's bodies and the file hold. */
  const pattern = (len) => Buffer.from(Array.from({ length: len }, (_, i) => i % 251));
  const B16K = pattern(16 * 1024);
  const B323K = pattern(323_000);
  const file = join(process.env.STATIC_DIR ?? "", "file");

  const app = express();
  app.get("/json", (_req, res) => res.json(catalog(8)));
  app.get("/json-40k", (_req, res) => res.json(catalog(263)));
  app.get("/json-323k", (_req, res) => res.json(catalog(2_100)));
  app.get("/16k", (_req, res) => res.type("application/octet-stream").send(B16K));
  app.get("/323k", (_req, res) => res.type("application/octet-stream").send(B323K));
  app.get("/323k-fresh", (_req, res) => res.type("application/octet-stream").send(Buffer.from(B323K)));
  app.get("/file", (_req, res) => res.sendFile(file));

  const addr = process.env.ADDR ?? "0.0.0.0:8080";
  const colon = addr.lastIndexOf(":");
  // the one equalization: actix-web's listen backlog of 1,024 (Node's own default is 511)
  app.listen({ host: addr.slice(0, colon), port: Number(addr.slice(colon + 1)), backlog: 1024 });
}
