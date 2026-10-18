import { gzipSync } from "node:zlib";
import { randomUUID } from "node:crypto";
import { writeFile, rename } from "node:fs/promises";
import { fetchHydrographicUnits } from "../src/integrations/senamhi/hydrographic-units.ts";
import { createFetchJsonTransport } from "../src/integrations/http/json-transport.ts";
const capture = await fetchHydrographicUnits(createFetchJsonTransport(), randomUUID());
const target = new URL("../data/.cache/hydrographic-units.json", import.meta.url);
await writeFile(new URL(target.href + ".tmp"), JSON.stringify(capture));
await rename(new URL(target.href + ".tmp"), target);
console.log(JSON.stringify({ state: "captured", units: capture.data.features.length }));

const archive = new URL("../data/spatial/hydrographic-units.json.gz", import.meta.url);
await writeFile(new URL(archive.href + ".tmp"), gzipSync(JSON.stringify(capture)));
await rename(new URL(archive.href + ".tmp"), archive);
