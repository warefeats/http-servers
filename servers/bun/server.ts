// One of the Bun bench server's processes (cluster.ts starts one per CPU): Bun.serve with its routes and reusePort.
import { join } from "node:path";

const TAGS = ["outdoor", "steel", "refurbished", "bulk", "eco", "imported"];

/** A page of `items` items, built on every request, as servers/common builds it. */
function catalog(items: number) {
  return {
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
  };
}

/** Byte `i % 251` at offset `i`, as every server's bodies and the file hold. */
const pattern = (len: number) => Uint8Array.from({ length: len }, (_, i) => i % 251);
const B16K = pattern(16 * 1024);
const B323K = pattern(323_000);
const octet = { "content-type": "application/octet-stream" };
const file = join(process.env["STATIC_DIR"] ?? "", "file");

const addr = process.env["ADDR"] ?? "0.0.0.0:8080";
const colon = addr.lastIndexOf(":");

Bun.serve({
  hostname: addr.slice(0, colon),
  port: Number(addr.slice(colon + 1)),
  reusePort: true,
  routes: {
    "/json": () => Response.json(catalog(8)),
    "/json-40k": () => Response.json(catalog(263)),
    "/json-323k": () => Response.json(catalog(2_100)),
    "/16k": () => new Response(B16K, { headers: octet }),
    "/323k": () => new Response(B323K, { headers: octet }),
    "/323k-fresh": () => new Response(B323K.slice(), { headers: octet }),
    // the file the way Bun's docs serve one, which writes it with sendfile
    "/file": () => new Response(Bun.file(file)),
  },
  fetch: () => new Response("not found\n", { status: 404 }),
});
