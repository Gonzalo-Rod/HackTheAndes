import { readFile } from "node:fs/promises";
import { loadDatabaseConfiguration } from "../src/config/env.ts";
import { createDatabasePool } from "../src/db/pool.ts";
import { persistCatchments } from "../src/db/catchments.ts";
const pool = createDatabasePool(loadDatabaseConfiguration());
try {
  const snapshot: unknown = JSON.parse(
    await readFile(new URL("../data/pe22/catchments.json", import.meta.url), "utf8"),
  );
  console.log(JSON.stringify(await persistCatchments(pool, snapshot)));
} catch (error) {
  console.error(
    JSON.stringify({
      state: "catchment_import_failed",
      errorType: error instanceof Error ? error.name : "UnknownError",
    }),
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
