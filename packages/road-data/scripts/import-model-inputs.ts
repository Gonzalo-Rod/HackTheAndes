import { loadDatabaseConfiguration } from "../src/config/env.ts";
import { createDatabasePool } from "../src/db/pool.ts";
import { createDataSnapshotRepository } from "../src/db/data-snapshots.ts";
import { historicalEventsSchema } from "../src/contracts/historical-events.ts";
import {
  readBundledHazardSource,
  readBundledHazards,
  readBundledTerrain,
  readBundledHistoricalEvents,
} from "../src/integrations/hydrobasins/model-input-files.ts";
import { persistHazards, persistTerrain } from "../src/db/spatial-inputs.ts";
const [hazards, terrain, events, source] = await Promise.all([
  readBundledHazards(),
  readBundledTerrain(),
  readBundledHistoricalEvents(),
  readBundledHazardSource(),
]);
if (
  hazards.geometryRevision !== terrain.geometryRevision ||
  events.geometryRevision !== terrain.geometryRevision
)
  throw new Error("Model input geometry revisions differ");
const pool = createDatabasePool(loadDatabaseConfiguration());
try {
  const hazardResult = await persistHazards(pool, hazards, source);
  const terrainResult = await persistTerrain(pool, terrain);
  await createDataSnapshotRepository(pool, historicalEventsSchema).save({
    dataset: "historical-events",
    key: "2024-2025-candidates",
    geometryRevision: events.geometryRevision,
    capturedAt: events.capturedAt,
    payload: events,
  });
  console.log(
    JSON.stringify({
      hazards: hazardResult,
      terrain: terrainResult,
      historicalCandidates: events.events.length,
      trainingReady: false,
    }),
  );
} catch (error) {
  console.error(
    JSON.stringify({
      state: "model_input_import_failed",
      errorType: error instanceof Error ? error.name : "UnknownError",
    }),
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
