import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { readFile, readdir, writeFile, rename } from "node:fs/promises";
import { readWeatherFile } from "../src/integrations/open-meteo/weather-files.ts";
import {
  readBundledHazards,
  readBundledTerrain,
  readBundledHistoricalEvents,
} from "../src/integrations/hydrobasins/model-input-files.ts";
import { aggregateRain } from "../src/domain/weather/aggregate.ts";
const [hazards, terrain, events] = await Promise.all([
  readBundledHazards(),
  readBundledTerrain(),
  readBundledHistoricalEvents(),
]);
const revision = hazards.geometryRevision;
if (terrain.geometryRevision !== revision || events.geometryRevision !== revision)
  throw new Error("Input geometry mismatch");
const weather = [];
const artifacts = [];
for (const name of (await readdir(new URL("../data/weather/", import.meta.url)))
  .filter((name) => name.endsWith(".json.gz"))
  .sort()) {
  const path = new URL(`../data/weather/${name}`, import.meta.url);
  const capture = await readWeatherFile(path);
  if (capture.geometryRevision !== revision) throw new Error("Weather geometry mismatch");
  const variables = Object.keys(capture.grids[0]?.values ?? {});
  weather.push({
    file: name,
    kind: capture.kind,
    model: capture.model,
    grids: capture.grids.length,
    catchments: capture.catchments.length,
    coverage: variables.map((variable) => ({
      variable,
      totalHours: capture.grids.reduce((n, g) => n + g.timesUtc.length, 0),
      knownHours: capture.grids.reduce(
        (n, g) =>
          n + (g.values[variable as keyof typeof g.values]?.filter((v) => v !== null).length ?? 0),
        0,
      ),
      firstKnown:
        capture.grids
          .map(
            (g) =>
              g.timesUtc[
                g.values[variable as keyof typeof g.values]?.findIndex((value) => value !== null) ??
                  -1
              ],
          )
          .filter(Boolean)
          .sort()[0] ?? null,
    })),
  });
  artifacts.push({
    file: `weather/${name}`,
    sha256: createHash("sha256")
      .update(await readFile(path))
      .digest("hex"),
  });
}
for (const file of [
  "pe22/catchments.json",
  "pe22/catchment-terrain.json",
  "pe22/hazards.json",
  "events/pe22-events.json",
  "events/coen-reviewed.json",
  "spatial/hazards-source.json.gz",
  "spatial/hydrographic-units.json.gz",
]) {
  artifacts.push({
    file,
    sha256: createHash("sha256")
      .update(await readFile(new URL(`../data/${file}`, import.meta.url)))
      .digest("hex"),
  });
}
const annualWeather = await Promise.all(
  [2024, 2025].map((year) =>
    readWeatherFile(
      new URL(`../data/weather/previous_runs-${year}-01-01-${year}-04-30.json.gz`, import.meta.url),
    ),
  ),
);
const eventCoverage = events.events.map((event) => {
  const capture = annualWeather[event.date.startsWith("2024") ? 0 : 1];
  if (!capture) throw new Error("Missing historical weather");
  // Audit availability only; these are not event labels or a common-time feature matrix.
  const start = Date.parse(event.occurrenceFromUtc);
  const end = Date.parse(event.occurrenceUntilUtc);
  const alignedStart = Math.floor(start / 3_600_000) * 3_600_000;
  const alignedEnd = Math.ceil(end / 3_600_000) * 3_600_000;
  return {
    id: event.id,
    date: event.date,
    located: event.position !== null,
    weatherCompleteAcrossCatchments: capture.catchments.every(
      (c) =>
        aggregateRain(
          capture,
          c.catchmentId,
          "precipitation_previous_day1",
          alignedStart,
          alignedEnd,
        ).ok,
    ),
  };
});
const manifest = {
  schemaVersion: 1,
  geometryRevision: revision,
  preparedAt: new Date().toISOString(),
  artifacts,
  weather,
  spatial: {
    sourceSusceptibilityPolygons: hazards.geometryDiagnostics.sourceSusceptibilityPolygonCount,
    displaySusceptibilityPolygons: hazards.susceptibility.features.length,
    invalidSourcePolygons: hazards.geometryDiagnostics.invalidSourcePolygons,
    nationalWarnings: hazards.warnings.nationalFeatureCount,
    warningsIntersectingRegion: hazards.warnings.features.length,
    segments: hazards.segmentExposure.length,
    segmentsWithKnownSusceptibility: hazards.segmentExposure.filter(
      (s) => s.susceptibilityClasses.length > 0,
    ).length,
    estimatedSlopeCatchments: terrain.catchments.length,
    hydrographicCoverage: hazards.hydrographicCrossCheck.catchments.map((c) => ({
      catchmentId: c.catchmentId,
      coverageFraction: c.coverageFraction,
    })),
    kilometerCalibration: "unverified",
  },
  eventCoverage,
  events: {
    candidates: events.events.length,
    negativeExamples: events.negativeExamples,
    trainingReady: false,
  },
  readiness: {
    weatherPipeline: "implemented",
    spatialInputs: "implemented_with_documented_uncertainty",
    historicalInputs: "captured_and_validated",
    supervisedForecastTraining: "blocked_by_label_coverage_and_as_of_design",
  },
};
const path = new URL("../data/model-inputs-manifest.json", import.meta.url);
if (process.argv.slice(2).length && process.argv.slice(2).join(" ") !== "--verify")
  throw new Error("Usage: model-inputs:check -- [--verify]");
if (process.argv.includes("--verify")) {
  const recorded = z
    .object({ preparedAt: z.iso.datetime() })
    .passthrough()
    .parse(JSON.parse(await readFile(path, "utf8")));
  if (!isDeepStrictEqual({ ...recorded, preparedAt: manifest.preparedAt }, manifest))
    throw new Error("Model input manifest is stale; regenerate it with model-inputs:check");
} else {
  await writeFile(new URL(path.href + ".tmp"), JSON.stringify(manifest, null, 2) + "\n");
  await rename(new URL(path.href + ".tmp"), path);
}
console.log(
  JSON.stringify({
    state: "verified",
    artifacts: artifacts.length,
    spatial: manifest.spatial,
    events: manifest.events,
    eventCoverage,
  }),
);
