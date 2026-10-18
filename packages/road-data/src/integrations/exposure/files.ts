import { mkdir, writeFile, rename, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { gzipSync } from "node:zlib";
import { loadBundledCatchments } from "../hydrobasins/snapshot.ts";
import { readBundledHazards } from "../hydrobasins/model-input-files.ts";
import { readWeatherFile } from "../open-meteo/weather-files.ts";
import { displaySegmentsSchema, PILOT_ROAD_CODE } from "../../contracts/road-geometry.ts";
import { validateExposureRecord } from "../../domain/exposure/record.ts";
import { readRoadJson, roadFiles } from "../road-files.ts";
export async function loadBundledExposureSources(roadCode: string = PILOT_ROAD_CODE) {
  const files = roadFiles(roadCode);
  const [weather, hazards, catchments, segments] = await Promise.all([
    readWeatherFile(files.weatherLive),
    readBundledHazards(roadCode),
    loadBundledCatchments(roadCode),
    readRoadJson(files.segments).then((value) => displaySegmentsSchema.parse(value)),
  ]);
  return { weather, hazards, catchments, segments };
}
export async function readBundledExposure(roadCode: string = PILOT_ROAD_CODE) {
  return validateExposureRecord(await readRoadJson(roadFiles(roadCode).exposure));
}
export async function writeExposureRecord(
  input: unknown,
  path: URL = roadFiles(PILOT_ROAD_CODE).exposure,
) {
  const record = validateExposureRecord(input);
  await mkdir(new URL("./", path), { recursive: true });
  const temporary = new URL(`${path.href}.${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, gzipSync(JSON.stringify(record)), { flag: "wx" });
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}
