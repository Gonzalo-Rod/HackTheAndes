import { readFile } from "node:fs/promises";
import {
  hazardCaptureSchema,
  preparedHazardsSchema,
  terrainCaptureSchema,
} from "../../contracts/spatial-inputs.ts";
import { historicalEventsSchema } from "../../contracts/historical-events.ts";
import { PILOT_ROAD_CODE } from "../../contracts/road-geometry.ts";
import { readRoadJson, roadFiles } from "../road-files.ts";
export async function readBundledHazards(roadCode: string = PILOT_ROAD_CODE) {
  return preparedHazardsSchema.parse(await readRoadJson(roadFiles(roadCode).hazards));
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

export async function readBundledHazardSource(roadCode: string = PILOT_ROAD_CODE) {
  return hazardCaptureSchema.parse(await readRoadJson(roadFiles(roadCode).hazardSource));
}
