// Imports prepared road files into the shared database: geometry, catchments, hazard layers,
// the live weather capture and the exposure assessment. Every write is idempotent by content key.
// Usage: npm run road:import -- PE-5N [PE-3N ...]
import { loadDatabaseConfiguration } from "../src/config/env.ts";
import { createDatabasePool } from "../src/db/pool.ts";
import { persistCatchments } from "../src/db/catchments.ts";
import { persistHazards } from "../src/db/spatial-inputs.ts";
import { createDataSnapshotRepository } from "../src/db/data-snapshots.ts";
import { createExposureRepository } from "../src/db/exposure.ts";
import { weatherCaptureSchema } from "../src/contracts/catchment-weather.ts";
import { roadCodeSchema } from "../src/contracts/road-geometry.ts";
import { importRoadGeometry } from "../src/services/import-road-geometry.ts";
import { readRoadJson, readRoadRegistry, roadFiles } from "../src/integrations/road-files.ts";
import { readWeatherFile } from "../src/integrations/open-meteo/weather-files.ts";
import { readBundledExposure } from "../src/integrations/exposure/files.ts";
import {
  readBundledHazardSource,
  readBundledHazards,
} from "../src/integrations/hydrobasins/model-input-files.ts";

const codes = process.argv.slice(2);
if (!codes.length || codes.some((code) => !roadCodeSchema.safeParse(code).success)) {
  console.error("Usage: npm run road:import -- PE-5N [PE-3N ...]");
  process.exit(1);
}
const registry = await readRoadRegistry();
const pool = createDatabasePool(loadDatabaseConfiguration());
const results: Record<string, unknown>[] = [];
try {
  for (const code of codes) {
    const files = roadFiles(code);
    let step = "registry";
    try {
      const entry = registry.roads.find((road) => road.roadCode === code);
      // Only reviewed, registered roads become forecast roads; the registry pins their revision.
      if (!entry) throw new Error("Road is not in the registry; run road:prepare first");
      step = "geometry";
      const geometry = await importRoadGeometry(pool, await readRoadJson(files.source));
      if (!geometry.ok) throw new Error(`Geometry rejected: ${geometry.error.code}`);
      if (geometry.value.geometryRevision !== entry.geometryRevision)
        throw new Error("Prepared geometry differs from the registered revision");
      step = "catchments";
      const catchments = await persistCatchments(pool, await readRoadJson(files.catchments));
      step = "hazards";
      const hazards = await persistHazards(
        pool,
        await readBundledHazards(code),
        await readBundledHazardSource(code),
      );
      step = "weather";
      const weather = await readWeatherFile(files.weatherLive);
      await createDataSnapshotRepository(pool, weatherCaptureSchema).save({
        dataset: "weather-operational",
        key: `prepared-${files.roadCode}.json.gz`,
        geometryRevision: weather.geometryRevision,
        capturedAt: weather.capturedAt,
        payload: weather,
      });
      step = "exposure";
      const exposure = await createExposureRepository(pool).save(await readBundledExposure(code));
      results.push({
        roadCode: code,
        state: "imported",
        geometryRevision: entry.geometryRevision,
        segments: geometry.value.segmentCount,
        catchments,
        hazards,
        exposure: { state: exposure.state, assessmentId: exposure.record.assessment.assessmentId },
      });
    } catch (error) {
      process.exitCode = 1;
      results.push({
        roadCode: code,
        state: "failed",
        step,
        errorType: error instanceof Error ? error.name : "UnknownError",
        message: error instanceof Error ? error.message : undefined,
      });
    }
  }
} finally {
  await pool.end();
}
console.log(JSON.stringify(results, null, 2));
