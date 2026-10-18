import { readFile, writeFile, rename, mkdir, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import { weatherCaptureSchema, type WeatherCapture } from "../../contracts/catchment-weather.ts";
export async function readWeatherFile(path: URL): Promise<WeatherCapture> {
  return weatherCaptureSchema.parse(
    JSON.parse(
      gunzipSync(await readFile(path), { maxOutputLength: 32 * 1024 * 1024 }).toString("utf8"),
    ),
  );
}
export async function writeWeatherFile(path: URL, input: unknown): Promise<void> {
  const value = weatherCaptureSchema.parse(input);
  await mkdir(new URL("./", path), { recursive: true });
  const temporary = new URL(path.href + `.${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, gzipSync(JSON.stringify(value)), { flag: "wx" });
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}

const bundledFiles = [
  "live.json.gz",
  "reanalysis-2023-12-24-2024-04-30.json.gz",
  "reanalysis-2024-12-24-2025-04-30.json.gz",
  "previous_runs-2024-01-01-2024-04-30.json.gz",
  "previous_runs-2025-01-01-2025-04-30.json.gz",
  "reanalysis-2023-02-01-2023-03-31.json.gz",
  "previous_runs-2023-12-24-2023-12-31.json.gz",
  "previous_runs-2024-12-24-2024-12-31.json.gz",
];
export async function readBundledWeather(file: string): Promise<WeatherCapture> {
  if (!bundledFiles.includes(file)) throw new Error("Unknown bundled weather dataset");
  return readWeatherFile(new URL(`../../../data/weather/${file}`, import.meta.url));
}
