import { readFile } from "node:fs/promises";
import { loadDatabaseConfiguration } from "../src/config/env.ts";
import { createDatabasePool } from "../src/db/pool.ts";
import { importRoadGeometry } from "../src/services/import-road-geometry.ts";

const pool = createDatabasePool(loadDatabaseConfiguration());
try {
  const snapshot: unknown = JSON.parse(
    await readFile(new URL("../data/pe22/source.json", import.meta.url), "utf8"),
  );
  const result = await importRoadGeometry(pool, snapshot);
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
} catch (error) {
  console.error(
    JSON.stringify({
      state: "import_failed",
      errorType: error instanceof Error ? error.name : "UnknownError",
      message:
        "Geometry import was not confirmed; no partial transaction was intentionally committed.",
    }),
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
