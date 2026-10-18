import { readFile, mkdir, writeFile, rename, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";
import { loadBundledCatchments } from "../hydrobasins/snapshot.ts";
import { readBundledHazards } from "../hydrobasins/model-input-files.ts";
import { readBundledWeather } from "../open-meteo/weather-files.ts";
import { displaySegmentsSchema } from "../../contracts/road-geometry.ts";
import { validateExposureRecord } from "../../domain/exposure/record.ts";
const bundledPath = new URL("../../../data/exposure/latest.json.gz", import.meta.url);
export async function loadBundledExposureSources() {
  const [weather, hazards, catchments, segments] = await Promise.all([
    readBundledWeather("live.json.gz"),
    readBundledHazards(),
    loadBundledCatchments(),
    readFile(new URL("../../../data/pe22/segments-1km.geojson", import.meta.url), "utf8").then(
      (v) => displaySegmentsSchema.parse(JSON.parse(v)),
    ),
  ]);
  return { weather, hazards, catchments, segments };
}
export async function readBundledExposure() {
  const data = await readFile(bundledPath);
  return validateExposureRecord(
    JSON.parse(gunzipSync(data, { maxOutputLength: 8 * 1024 * 1024 }).toString("utf8")),
  );
}
export async function writeExposureRecord(input: unknown, path: URL = bundledPath) {
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
