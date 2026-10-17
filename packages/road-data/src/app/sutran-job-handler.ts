import { randomUUID } from "node:crypto";
import { createBearerAuthorizer, readBoundedJson } from "./internal-http.ts";
import { jobRequestSchema, type JobLog, type JobOutcome } from "../contracts/jobs.ts";
import { parseJobConfiguration } from "../config/env.ts";

// Small JSON envelope only: never accept source data, credentials, or arbitrary provider URLs.
const MAX_BODY_BYTES = 1_024;
export const SUTRAN_JOB_TIMEOUT_MS = 120_000;
export function createSutranJobHandler({
  secret,
  run,
  logger = (entry) => console.error(JSON.stringify(entry)),
}: {
  secret: string;
  run: (requestId: string, signal: AbortSignal) => Promise<JobOutcome>;
  logger?: (entry: JobLog) => void;
}) {
  parseJobConfiguration({ ROAD_DATA_JOB_SECRET: secret });
  const authorized = createBearerAuthorizer(secret);
  return async function handle(request: Request): Promise<Response> {
    const startedAt = performance.now();
    let requestId = randomUUID() as string;
    const respond = (body: unknown, status: number, result: string) => {
      logger({
        requestId,
        operation: "sutran.job.http",
        provider: "sutran",
        durationMs: performance.now() - startedAt,
        result,
      });
      return Response.json(body, {
        status,
        headers: {
          "Cache-Control": "no-store",
          "X-Request-Id": requestId,
          ...(status === 405 ? { Allow: "POST" } : {}),
        },
      });
    };
    const fail = (status: number, code: string, message: string) =>
      respond({ error: { code, message } }, status, code);

    if (!authorized(request))
      return fail(401, "unauthorized", "Valid job credentials are required");
    if (request.method !== "POST") return fail(405, "method_not_allowed", "Use POST");
    if (
      request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !==
      "application/json"
    )
      return fail(415, "unsupported_media_type", "Use application/json");
    const declaredLength = request.headers.get("content-length");
    if (
      declaredLength !== null &&
      (!/^\d+$/.test(declaredLength) || Number(declaredLength) > MAX_BODY_BYTES)
    )
      return fail(413, "body_too_large", "The job request exceeds its size limit");
    let body: unknown;
    try {
      body = await readBoundedJson(request, MAX_BODY_BYTES);
    } catch (error) {
      return error instanceof RangeError
        ? fail(413, "body_too_large", "The job request exceeds its size limit")
        : fail(400, "invalid_json", "A valid JSON job request is required");
    }
    const parsed = jobRequestSchema.safeParse(body);
    if (!parsed.success) return fail(400, "invalid_request", "Provide only a valid requestId");
    requestId = parsed.data.requestId;
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(SUTRAN_JOB_TIMEOUT_MS)]);
    try {
      const outcome = await run(requestId, signal);
      const status = outcome.status === "complete" ? 200 : outcome.status === "running" ? 409 : 503;
      return respond(
        outcome.status === "running"
          ? {
              ...outcome,
              error: {
                code: "job_running",
                message: "This execution is already running",
              },
            }
          : outcome,
        status,
        outcome.status,
      );
    } catch {
      return fail(
        503,
        "job_unavailable",
        "Ingestion was not confirmed; committed records were preserved",
      );
    }
  };
}
