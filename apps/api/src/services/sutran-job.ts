import "server-only";
import { randomUUID } from "node:crypto";
import { createDatabasePool } from "@peruroad/road-data/database";
import { createPostgresSutranJobHandler } from "@peruroad/road-data/jobs";
import { loadConfiguration } from "../config/env";

let handler: ((request: Request) => Promise<Response>) | undefined;

export async function runSutranJob(request: Request): Promise<Response> {
  const startedAt = performance.now();
  try {
    // Next builds without runtime secrets; validate configuration before the first job.
    if (!handler) {
      const configuration = loadConfiguration();
      handler = createPostgresSutranJobHandler({
        pool: createDatabasePool(configuration),
        secret: configuration.ROAD_DATA_JOB_SECRET,
      });
    }
    return await handler(request);
  } catch (error) {
    const requestId = randomUUID();
    console.error(
      JSON.stringify({
        requestId,
        operation: "sutran.job.runtime",
        provider: "sutran",
        durationMs: performance.now() - startedAt,
        result: "failure",
        errorType: error instanceof Error ? error.name : "UnknownError",
      }),
    );
    return Response.json(
      {
        error: {
          code: "job_unavailable",
          message: "Ingestion is unavailable; committed records were preserved",
        },
      },
      {
        status: 503,
        headers: { "Cache-Control": "no-store", "X-Request-Id": requestId },
      },
    );
  }
}
