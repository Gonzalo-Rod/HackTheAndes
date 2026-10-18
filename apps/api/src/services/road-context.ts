import "server-only";
import { randomUUID } from "node:crypto";
import { createDatabasePool } from "@peruroad/road-data/database";
import {
  createRoadContextHandler,
  createRoadContextService,
  createPostgresRoadContextRepository,
  loadRoadContextServerConfiguration,
} from "@peruroad/road-data/context";

let handler: ((request: Request) => Promise<Response>) | undefined;
export async function runRoadContext(request: Request): Promise<Response> {
  const startedAt = performance.now();
  try {
    if (!handler) {
      const config = loadRoadContextServerConfiguration();
      const service = createRoadContextService({
        repository: createPostgresRoadContextRepository(
          createDatabasePool(config),
          config.ROAD_DATA_GEOMETRY_REVISION,
        ),
      });
      handler = createRoadContextHandler({
        secret: config.ROAD_DATA_API_SECRET,
        execute: service.execute,
      });
    }
    return await handler(request);
  } catch (error) {
    const requestId = randomUUID();
    console.error(
      JSON.stringify({
        requestId,
        operation: "road.context.runtime",
        provider: "internal",
        durationMs: performance.now() - startedAt,
        result: "failure",
        errorType: error instanceof Error ? error.name : "UnknownError",
      }),
    );
    return Response.json(
      {
        error: {
          code: "context_unavailable",
          message: "Los datos viales no están disponibles. Intenta más tarde.",
        },
      },
      {
        status: 503,
        headers: { "Cache-Control": "no-store", "X-Request-Id": requestId },
      },
    );
  }
}
