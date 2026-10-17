import { gunzipSync } from "node:zlib";
import { readFile } from "node:fs/promises";
import {
  hazardCaptureSchema,
  preparedHazardsSchema,
  terrainCaptureSchema,
} from "../../contracts/spatial-inputs.ts";
import { historicalEventsSchema } from "../../contracts/historical-events.ts";
export async function readBundledHazards() {
  return preparedHazardsSchema.parse(
    JSON.parse(await readFile(new URL("../../../data/pe22/hazards.json", import.meta.url), "utf8")),
  );
}
export async function readBundledTerrain() {
  return terrainCaptureSchema.parse(
    JSON.parse(
      await readFile(new URL("../../../data/pe22/catchment-terrain.json", import.meta.url), "utf8"),
    ),
  );
}
export async function readBundledHistoricalEvents() {
  return historicalEventsSchema.parse(
    JSON.parse(
      await readFile(new URL("../../../data/events/pe22-events.json", import.meta.url), "utf8"),
    ),
  );
}

export async function readBundledHazardSource() {
  return hazardCaptureSchema.parse(
    JSON.parse(
      gunzipSync(
        await readFile(new URL("../../../data/spatial/hazards-source.json.gz", import.meta.url)),
        { maxOutputLength: 32 * 1024 * 1024 },
      ).toString("utf8"),
    ),
  );
}
