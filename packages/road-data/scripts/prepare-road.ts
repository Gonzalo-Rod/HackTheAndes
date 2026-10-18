// Prepares climate-exposure inputs for any national road: geometry, catchments, official
// hazard layers, live weather and an exposure assessment, then records the road in the registry.
// Usage: npm run road:prepare -- PE-5N PE-3N [--offline-geometry | --register-only]
// --register-only records already prepared files (for example the reviewed PE-22 pilot) unchanged.
import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { z } from "zod";
import { createFetchJsonTransport } from "../src/integrations/http/json-transport.ts";
import { createBinaryTransport } from "../src/integrations/http/binary-transport.ts";
import { createIngemmetOperatorCache } from "../src/integrations/ingemmet/operator-cache.ts";
import { createSusceptibilityProvider } from "../src/integrations/ingemmet/susceptibility.ts";
import { createWarningProvider } from "../src/integrations/senamhi/warnings.ts";
import { createPrecipitationProvider } from "../src/integrations/open-meteo/precipitation.ts";
import { readWeatherFile, writeWeatherFile } from "../src/integrations/open-meteo/weather-files.ts";
import {
  createSutranRoadNetworkAdapter,
  type RoadSelection,
} from "../src/integrations/sutran/road-network.ts";
import {
  ROAD_REGISTRY_URL,
  readRoadJson,
  readRoadRegistry,
  roadFiles,
  type RoadFiles,
  type RoadRegistryEntry,
} from "../src/integrations/road-files.ts";
import { readBundledExposure, writeExposureRecord } from "../src/integrations/exposure/files.ts";
import {
  displaySegmentsSchema,
  roadCodeSchema,
  roadNetworkSnapshotSchema,
} from "../src/contracts/road-geometry.ts";
import { catchmentSnapshotSchema } from "../src/contracts/road-catchments.ts";
import { hazardCaptureSchema, preparedHazardsSchema } from "../src/contracts/spatial-inputs.ts";
import { prepareRoadGeometry } from "../src/services/prepare-road-geometry.ts";
import { prepareCatchmentWeather } from "../src/services/prepare-catchment-weather.ts";
import { prepareExposure } from "../src/services/prepare-exposure.ts";
import { admitForecastRoad } from "../src/domain/road-data/forecast-budget.ts";

const PACKAGE_ROOT = new URL("../", import.meta.url);
const PYTHON = fileURLToPath(new URL(".venv/bin/python", PACKAGE_ROOT));
const OFFLINE_GEOMETRY = "--offline-geometry";
const REGISTER_ONLY = "--register-only";
const FLAGS = new Set([OFFLINE_GEOMETRY, REGISTER_ONLY]);
// Static GIS layers are slow to serve.
const GIS_TIMEOUT_MS = 120_000;
// ECMWF IFS 0.25° cells sit on exact 0.25° multiples in Open-Meteo responses.
const MODEL_GRID_DEGREES = 0.25;
// Twenty locations per batch every 2.5 s stays below the free tier's ~600 calls a minute.
const WEATHER_BATCH_INTERVAL_MS = 2_500;
// Offline captures are not user-facing; 20-location batches have taken ~8 s under load.
const WEATHER_TIMEOUT_MS = 30_000;

const args = process.argv.slice(2);
const codes = args.filter((arg) => !arg.startsWith("--"));
if (
  codes.length === 0 ||
  args.some((arg) => arg.startsWith("--") && !FLAGS.has(arg)) ||
  codes.some((code) => !roadCodeSchema.safeParse(code).success)
) {
  console.error(
    "Usage: npm run road:prepare -- PE-5N [PE-3N ...] [--offline-geometry | --register-only]",
  );
  process.exit(1);
}

const requestId = randomUUID();
const json = createFetchJsonTransport({ timeoutMs: GIS_TIMEOUT_MS });
const gis = createIngemmetOperatorCache(json, new URL("data/.cache/ingemmet/", PACKAGE_ROOT));

function log(fields: Record<string, unknown>) {
  console.error(JSON.stringify({ requestId, operation: "road.prepare", ...fields }));
}

async function writeAtomic(path: URL, content: string | Buffer) {
  await mkdir(new URL("./", path), { recursive: true });
  const temporary = new URL(`${path.href}.${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, content, { flag: "wx" });
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}

function encode(path: URL, value: unknown): string | Buffer {
  const text = JSON.stringify(value);
  return path.pathname.endsWith(".gz") ? gzipSync(text) : text + "\n";
}

function runPython(script: string, options: Record<string, URL>): Promise<void> {
  const argv = [fileURLToPath(new URL(`python/${script}`, PACKAGE_ROOT))];
  for (const [name, path] of Object.entries(options)) argv.push(`--${name}`, fileURLToPath(path));
  return new Promise((resolve, reject) => {
    const child = spawn(PYTHON, argv, { stdio: ["ignore", "inherit", "inherit"] });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${script} exited with code ${code}`)),
    );
  });
}

async function selectGeometry(): Promise<Map<string, RoadSelection>> {
  if (!args.includes(OFFLINE_GEOMETRY))
    return createSutranRoadNetworkAdapter({ transport: json }).fetchRoads(codes, { requestId });
  const selections = new Map<string, RoadSelection>();
  for (const code of codes) {
    const parsed = roadNetworkSnapshotSchema.safeParse(await readRoadJson(roadFiles(code).source));
    selections.set(
      code,
      parsed.success ? { ok: true, value: parsed.data } : { ok: false, error: "invalid_source" },
    );
  }
  return selections;
}

async function prepareGeometry(files: RoadFiles, selection: RoadSelection) {
  if (!selection.ok) throw new Error(`Geometry unavailable: ${selection.error}`);
  const result = prepareRoadGeometry(selection.value);
  if (!result.ok) throw new Error(`Geometry rejected: ${result.error.code}`);
  const { corridor, segments, diagnostics } = result.value;
  const contents: [URL, string][] = [
    [files.source, JSON.stringify(selection.value, null, 2) + "\n"],
    [files.corridor, JSON.stringify(corridor) + "\n"],
    [files.segments, JSON.stringify(segments) + "\n"],
    [files.diagnostics, JSON.stringify(diagnostics, null, 2) + "\n"],
  ];
  for (const [path, content] of contents) await writeAtomic(path, content);
  // Published last: its hashes detect mixed files after an interrupted build.
  await writeAtomic(
    files.manifest,
    JSON.stringify(
      {
        schemaVersion: 1,
        roadCode: files.roadCode,
        geometryRevision: corridor.properties.geometryRevision,
        measuredLengthKm: corridor.properties.measuredLengthKm,
        segmentCount: segments.features.length,
        kilometerCalibration: "unverified",
        files: Object.fromEntries(
          contents.map(([path, content]) => [
            path.pathname.split("/").at(-1),
            createHash("sha256").update(content).digest("hex"),
          ]),
        ),
      },
      null,
      2,
    ) + "\n",
  );
}

/** MTC names each section; the name covering most kilometers labels the road. */
function dominantName(snapshot: z.infer<typeof roadNetworkSnapshotSchema>): string {
  const kilometers = new Map<string, number>();
  for (const { properties } of snapshot.features)
    kilometers.set(
      properties.name,
      (kilometers.get(properties.name) ?? 0) + properties.sourceLengthKm,
    );
  return [...kilometers].sort((a, b) => b[1] - a[1])[0]?.[0] ?? snapshot.roadCode;
}

/** Builds the registry entry from the files on disk, so a mixed set of files is rejected. */
async function describeRoad(files: RoadFiles): Promise<RoadRegistryEntry> {
  const [source, segments, catchments, weather, exposure] = await Promise.all([
    readRoadJson(files.source).then((value) => roadNetworkSnapshotSchema.parse(value)),
    readRoadJson(files.segments).then((value) => displaySegmentsSchema.parse(value)),
    readRoadJson(files.catchments).then((value) => catchmentSnapshotSchema.parse(value)),
    readWeatherFile(files.weatherLive),
    readBundledExposure(files.roadCode),
  ]);
  const revision = exposure.assessment.geometryRevision;
  if (
    [catchments.geometryRevision, weather.geometryRevision].some((value) => value !== revision) ||
    segments.features.some((segment) => segment.properties.geometryRevision !== revision)
  )
    throw new Error("Prepared files belong to different geometry revisions");
  const last = segments.features.at(-1);
  if (!last) throw new Error("Road has no segments");
  return {
    roadCode: files.roadCode,
    name: dominantName(source),
    geometryRevision: revision,
    measuredLengthKm: last.properties.distanceFromOriginEndKm,
    segmentCount: segments.features.length,
    catchmentCount: catchments.features.length,
    weatherGridCount: weather.grids.length,
    preparedAt: exposure.assessment.assessedAt,
  };
}

async function prepareCatchments(files: RoadFiles) {
  await mkdir(files.cache, { recursive: true });
  await runPython("prepare_catchments.py", {
    corridor: files.corridor,
    segments: files.segments,
    output: files.catchmentCandidate,
  });
  const snapshot = catchmentSnapshotSchema.parse(await readRoadJson(files.catchmentCandidate));
  await writeAtomic(files.catchments, JSON.stringify(snapshot) + "\n");
  return snapshot;
}

async function captureHazards(
  files: RoadFiles,
  catchments: z.infer<typeof catchmentSnapshotSchema>,
  warnings: unknown,
) {
  const corridor = z
    .object({ geometry: z.object({ coordinates: z.array(z.tuple([z.number(), z.number()])) }) })
    .parse(await readRoadJson(files.corridor));
  const susceptibility = await createSusceptibilityProvider(gis).fetchLayer(
    corridor.geometry.coordinates,
    [
      ...new Map(
        catchments.features.flatMap((feature) =>
          feature.properties.samplePoints.map(
            (sample) =>
              [`${sample.longitude},${sample.latitude}`, [sample.longitude, sample.latitude]] as [
                string,
                [number, number],
              ],
          ),
        ),
      ).values(),
    ],
    requestId,
  );
  const capture = hazardCaptureSchema.parse({
    schemaVersion: 1,
    geometryRevision: catchments.geometryRevision,
    capturedAt: new Date().toISOString(),
    susceptibility,
    warnings,
    limitations: [
      "Susceptibility is static context, not a forecast or an event observation.",
      "INGEMMET publication/scale and pre-2024 availability remain unverified.",
      "Only polygons intersecting the road axis or sampling points were queried; other territory is unknown.",
      "SENAMHI validity uses the bulletin's local time interpreted as America/Lima; issue time is not supplied.",
      "Official warning levels are not our model risk classes.",
    ],
  });
  await writeAtomic(files.hazardSource, gzipSync(JSON.stringify(capture)));
  await runPython("prepare_hazards.py", {
    source: files.hazardSource,
    catchments: files.catchments,
    corridor: files.corridor,
    segments: files.segments,
    output: files.hazardCandidate,
  });
  const hazards = preparedHazardsSchema.parse(await readRoadJson(files.hazardCandidate));
  await writeAtomic(files.hazards, encode(files.hazards, hazards));
  return hazards;
}

async function captureWeather(files: RoadFiles, catchments: unknown) {
  const capture = await prepareCatchmentWeather({
    catchments,
    provider: createPrecipitationProvider(
      createFetchJsonTransport({ timeoutMs: WEATHER_TIMEOUT_MS }),
      {
        batchIntervalMs: WEATHER_BATCH_INTERVAL_MS,
      },
    ),
    query: { kind: "operational" },
    requestId,
    now: new Date(),
    snapDegrees: MODEL_GRID_DEGREES,
  });
  await writeWeatherFile(files.weatherLive, capture);
  return capture;
}

async function assess(files: RoadFiles, sources: Parameters<typeof prepareExposure>[0]) {
  const result = prepareExposure(sources, new Date().toISOString());
  if (!result.ok) throw new Error(`Exposure rejected: ${result.error.code}`);
  await rm(files.exposure, { force: true });
  await writeExposureRecord(result.value, files.exposure);
  return result.value.assessment;
}

/** Admits roads in the given order while they fit the forecast budget; returns the rejected ones. */
async function updateRegistry(entries: RoadRegistryEntry[]) {
  const registry = await readRoadRegistry();
  const roads = new Map(registry.roads.map((road) => [road.roadCode, road]));
  const rejected: { roadCode: string; step: string; message: string }[] = [];
  for (const entry of entries) {
    const admission = admitForecastRoad(entry, [...roads.values()]);
    if (admission.ok) roads.set(entry.roadCode, entry);
    else rejected.push({ roadCode: entry.roadCode, step: "budget", message: admission.message });
  }
  const sorted = [...roads.values()].sort((a, b) => a.roadCode.localeCompare(b.roadCode));
  await writeAtomic(
    ROAD_REGISTRY_URL,
    JSON.stringify({ schemaVersion: 1, roads: sorted }, null, 2) + "\n",
  );
  return rejected;
}

const started = performance.now();
const registerOnly = args.includes(REGISTER_ONLY);
const selections = registerOnly ? new Map<string, RoadSelection>() : await selectGeometry();
// One national SENAMHI bulletin serves every road in this run.
const warnings = registerOnly
  ? null
  : await createWarningProvider(
      json,
      createBinaryTransport({ maxBytes: 2 * 1024 * 1024 }),
    ).fetchLayer(requestId);
const prepared: RoadRegistryEntry[] = [];
const failed: { roadCode: string; step: string; message: string }[] = [];
for (const code of codes) {
  const files = roadFiles(code);
  let step = "geometry";
  try {
    if (registerOnly) {
      step = "register";
      prepared.push(await describeRoad(files));
      continue;
    }
    await prepareGeometry(files, selections.get(code) ?? { ok: false, error: "missing" });
    step = "catchments";
    const catchments = await prepareCatchments(files);
    step = "hazards";
    const hazards = await captureHazards(files, catchments, warnings);
    step = "weather";
    const weather = await captureWeather(files, catchments);
    step = "exposure";
    const segments = await readRoadJson(files.segments);
    await assess(files, { weather, hazards, catchments, segments });
    step = "register";
    const entry = await describeRoad(files);
    prepared.push(entry);
    log({
      roadCode: code,
      result: "success",
      lengthKm: Math.round(entry.measuredLengthKm),
      catchments: catchments.features.length,
      linkedSegments: catchments.diagnostics.linkedSegments,
      segments: entry.segmentCount,
      weatherGrids: weather.grids.length,
      susceptibilityPolygons: hazards.susceptibility.features.length,
    });
  } catch (error) {
    failed.push({
      roadCode: code,
      step,
      message: error instanceof Error ? error.message : "UnknownError",
    });
    log({
      roadCode: code,
      step,
      result: "failure",
      errorType: error instanceof Error ? error.name : "UnknownError",
    });
  }
}
const rejected = await updateRegistry(prepared);
failed.push(...rejected);
const admitted = prepared.filter(
  (road) => !rejected.some((item) => item.roadCode === road.roadCode),
);
console.log(
  JSON.stringify(
    {
      state: failed.length ? (admitted.length ? "partial" : "failed") : "prepared",
      durationS: Math.round((performance.now() - started) / 1000),
      prepared: admitted.map((road) => road.roadCode),
      failed,
    },
    null,
    2,
  ),
);
if (failed.length) process.exitCode = 1;
