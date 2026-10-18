// Imports a registered road's forecast into the shared database: its segments and exposure
// assessment, which is all the app and the hourly climate job read for non-pilot roads. Catchment
// and hazard files stay in git for audit; storing their raw polygons per road would multiply the
// database size. Every write is idempotent by content key.
// Usage: npm run road:import -- PE-5N [PE-3N ...]
import { loadDatabaseConfiguration } from "../src/config/env.ts";
import { createDatabasePool } from "../src/db/pool.ts";
import { createExposureRepository } from "../src/db/exposure.ts";
import { roadCodeSchema } from "../src/contracts/road-geometry.ts";
import { importRoadGeometry } from "../src/services/import-road-geometry.ts";
import { readRoadJson, readRoadRegistry, roadFiles } from "../src/integrations/road-files.ts";
import { readBundledExposure } from "../src/integrations/exposure/files.ts";

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
      step = "exposure";
      const exposure = await createExposureRepository(pool).save(await readBundledExposure(code));
      results.push({
        roadCode: code,
        state: "imported",
        geometryRevision: entry.geometryRevision,
        segments: geometry.value.segmentCount,
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
