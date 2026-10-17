import { randomUUID } from "node:crypto";
import { loadDatabaseConfiguration } from "../src/config/env.ts";
import { createDatabasePool } from "../src/db/pool.ts";
import { createPostgresOfficialAlertRepository } from "../src/db/official-alert-repository.ts";
import { createSutranIngestionService } from "../src/services/ingest-sutran-alerts.ts";
import { createSutranAdapter, createFetchJsonTransport } from "../src/integrations/sutran/index.ts";

const pool = createDatabasePool(loadDatabaseConfiguration());
const requestId = randomUUID();
try {
  await pool.query(
    "insert into private.ingestion_runs (request_id, provider, status) values ($1, 'sutran', 'running')",
    [requestId],
  );
  const result = await createSutranIngestionService({
    source: createSutranAdapter({ transport: createFetchJsonTransport() }),
    repository: createPostgresOfficialAlertRepository(pool),
  }).run({ requestId });
  const status = result.ok ? result.value.status : "failure";
  await pool.query(
    "update private.ingestion_runs set finished_at = now(), status = $2, summary = $3::jsonb where request_id = $1",
    [requestId, status, JSON.stringify(result)],
  );
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok || result.value.status !== "complete") process.exitCode = 1;
} catch (error) {
  try {
    await pool.query(
      "update private.ingestion_runs set finished_at = now(), status = 'failure', summary = '{\"code\":\"unexpected_failure\"}'::jsonb where request_id = $1",
      [requestId],
    );
  } catch {
    console.error(JSON.stringify({ requestId, state: "audit_unavailable" }));
  }
  console.error(
    JSON.stringify({
      requestId,
      state: "ingestion_failed",
      errorType: error instanceof Error ? error.name : "UnknownError",
      message:
        "Ingestion was not confirmed. Existing committed records were retained; a retry is idempotent.",
    }),
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
