import type { IngestionResult } from "../contracts/ingestion.ts";
import {
  jobRequestSchema,
  type IngestionRunStore,
  type JobLog,
  type JobOutcome,
} from "../contracts/jobs.ts";

interface JobDependencies {
  ingestion: {
    run(options: { requestId: string; signal: AbortSignal }): Promise<IngestionResult>;
  };
  runs: IngestionRunStore;
  logger?: (entry: JobLog) => void;
}

export function createSutranJob({
  ingestion,
  runs,
  logger = (entry) => console.error(JSON.stringify(entry)),
}: JobDependencies) {
  return async function run(requestId: string, signal: AbortSignal): Promise<JobOutcome> {
    jobRequestSchema.parse({ requestId });
    const startedAt = performance.now();
    const log = (result: string, errorType?: string) =>
      logger({
        requestId,
        operation: "sutran.job",
        provider: "sutran",
        durationMs: performance.now() - startedAt,
        result,
        ...(errorType ? { errorType } : {}),
      });
    if (!(await runs.reserve(requestId))) {
      log("duplicate");
      return runs.read(requestId);
    }
    let outcome: JobOutcome;
    try {
      signal.throwIfAborted();
      const result = await ingestion.run({ requestId, signal });
      if (result.ok) {
        const summary = result.value;
        outcome = {
          requestId,
          status: summary.status,
          counts: {
            selected: summary.selected,
            inserted: summary.inserted,
            updated: summary.updated,
            unchanged: summary.unchanged,
            historyInserted: summary.historyInserted,
            failed: summary.failed,
            conflicts: summary.conflicts,
            sourceRejected: summary.sourceRejected,
          },
          ...(summary.status === "partial"
            ? {
                error: {
                  code: "partial_ingestion",
                  message: "Some records or history are pending; committed records were preserved",
                },
              }
            : {}),
        };
      } else {
        outcome = { requestId, status: "failure", error: result.error };
      }
    } catch (error) {
      const code = signal.aborted ? "job_cancelled" : "ingestion_unavailable";
      log("failure", error instanceof Error ? error.name : "UnknownError");
      outcome = {
        requestId,
        status: "failure",
        error: { code, message: "Ingestion was not completed; committed records were preserved" },
      };
    }
    // A successful HTTP response requires both persistence and its durable audit to finish.
    await runs.finish(outcome);
    log(outcome.status);
    return outcome;
  };
}
