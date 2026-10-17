import type { Pool } from "pg";
import { createSutranJobHandler } from "./app/sutran-job-handler.ts";
import { createPostgresIngestionRunStore } from "./db/ingestion-runs.ts";
import { createPostgresOfficialAlertRepository } from "./db/official-alert-repository.ts";
import { createSutranAdapter, createFetchJsonTransport } from "./integrations/sutran/index.ts";
import { createSutranIngestionService } from "./services/ingest-sutran-alerts.ts";
import { createSutranJob } from "./services/run-sutran-job.ts";

export { createSutranJobHandler, SUTRAN_JOB_TIMEOUT_MS } from "./app/sutran-job-handler.ts";
export { createSutranJob } from "./services/run-sutran-job.ts";
export { jobRequestSchema, jobOutcomeSchema } from "./contracts/jobs.ts";
export type { JobOutcome, JobLog, IngestionRunStore } from "./contracts/jobs.ts";
export { loadJobConfiguration, parseJobConfiguration } from "./config/env.ts";

/** Create once per server process; the application owns the pool's lifetime. */
export function createPostgresSutranJobHandler({ pool, secret }: { pool: Pool; secret: string }) {
  return createSutranJobHandler({
    secret,
    run: createSutranJob({
      ingestion: createSutranIngestionService({
        source: createSutranAdapter({ transport: createFetchJsonTransport() }),
        repository: createPostgresOfficialAlertRepository(pool),
      }),
      runs: createPostgresIngestionRunStore(pool),
    }),
  });
}
