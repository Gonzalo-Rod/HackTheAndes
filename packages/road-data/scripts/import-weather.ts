import { readdir } from "node:fs/promises";
import { loadDatabaseConfiguration } from "../src/config/env.ts";
import { createDatabasePool } from "../src/db/pool.ts";
import { createDataSnapshotRepository } from "../src/db/data-snapshots.ts";
import { weatherCaptureSchema } from "../src/contracts/catchment-weather.ts";
import { readWeatherFile } from "../src/integrations/open-meteo/weather-files.ts";
const pool = createDatabasePool(loadDatabaseConfiguration());
try {
  const repository = createDataSnapshotRepository(pool, weatherCaptureSchema);
  const directory = new URL("../data/weather/", import.meta.url);
  let stored = 0;
  for (const name of (await readdir(directory))
    .filter((name) => name.endsWith(".json.gz"))
    .sort()) {
    const payload = await readWeatherFile(new URL(name, directory));
    await repository.save({
      dataset: `weather-${payload.kind}`,
      key: name,
      geometryRevision: payload.geometryRevision,
      capturedAt: payload.capturedAt,
      payload,
    });
    stored++;
  }
  console.log(JSON.stringify({ state: "stored", captures: stored }));
} catch (error) {
  console.error(
    JSON.stringify({
      state: "weather_import_failed",
      errorType: error instanceof Error ? error.name : "UnknownError",
    }),
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
