import { randomUUID, createHash } from "node:crypto";
import { mkdir, writeFile, rename } from "node:fs/promises";
import { createBinaryTransport } from "../src/integrations/http/binary-transport.ts";
import { fetchProviasExport } from "../src/integrations/provias/export.ts";
const directory = new URL("../data/.cache/", import.meta.url);
await mkdir(directory, { recursive: true });
const transport = createBinaryTransport({ timeoutMs: 120_000, maxBytes: 20 * 1024 * 1024 });
const requestId = randomUUID();
const manifests = [];
for (const year of [2024, 2025] as const) {
  const result = await fetchProviasExport(transport, year, requestId);
  const target = new URL(`provias-${year}.xlsx`, directory);
  await writeFile(new URL(target.href + ".tmp"), result.bytes);
  await rename(new URL(target.href + ".tmp"), target);
  manifests.push({
    year,
    sourceUrl: result.url,
    capturedAt: new Date().toISOString(),
    sha256: createHash("sha256").update(result.bytes).digest("hex"),
    bytes: result.bytes.length,
  });
}
await writeFile(new URL("historical-event-sources.json", directory), JSON.stringify(manifests));
console.log(
  JSON.stringify({
    state: "captured",
    exports: manifests.map((m) => ({ year: m.year, bytes: m.bytes, sha256: m.sha256 })),
  }),
);
