import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { loadDatabaseConfiguration } from "../src/config/env.ts";
import { createDatabasePool } from "../src/db/pool.ts";
import { importPe22Elevation } from "../src/services/import-pe22-elevation.ts";

const pool = createDatabasePool(loadDatabaseConfiguration());
const requestId = randomUUID();
const startedAt = performance.now();
try {
  const snapshot: unknown = JSON.parse(
    await readFile(new URL("../data/pe22/elevation.json", import.meta.url), "utf8"),
  );
  const result = await importPe22Elevation(pool, snapshot);
  console.log(JSON.stringify(result, null, 2));
  console.error(
    JSON.stringify({
      requestId,
      operation: "pe22.elevation.import",
      provider: "supabase",
      durationMs: performance.now() - startedAt,
      result: result.ok ? "success" : "failure",
    }),
  );
  if (!result.ok) process.exitCode = 1;
} catch (error) {
  console.error(
    JSON.stringify({
      requestId,
      operation: "pe22.elevation.import",
      provider: "supabase",
      durationMs: performance.now() - startedAt,
      result: "failure",
      errorType: error instanceof Error ? error.name : "UnknownError",
      message:
        "Elevation import was not confirmed. Inspect current rows before retrying; no partial import was intentionally committed.",
    }),
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
