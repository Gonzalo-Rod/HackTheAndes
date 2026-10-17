import { randomUUID } from "node:crypto";
import {
  roadContextRequestSchema,
  roadContextResponseSchema,
  type RoadContextLog,
  type RoadContextRequest,
  type RoadContextResponse,
} from "../contracts/road-context.ts";
import { parseRoadContextSecret } from "../config/env.ts";
import { createBearerAuthorizer, readBoundedJson } from "./internal-http.ts";

// Only a place name or pin is accepted: never a phone number, report body, or arbitrary URL.
const MAX_CONTEXT_BODY_BYTES = 1024;
export function createRoadContextHandler({
  secret,
  execute,
  logger = (entry: RoadContextLog) => console.error(JSON.stringify(entry)),
}: {
  secret: string;
  execute: (input: RoadContextRequest, requestId: string) => Promise<RoadContextResponse>;
  logger?: (entry: RoadContextLog) => void;
}) {
  parseRoadContextSecret({ ROAD_DATA_API_SECRET: secret });
  const authorized = createBearerAuthorizer(secret);
  return async (request: Request): Promise<Response> => {
    const startedAt = performance.now();
    const requestId = randomUUID();
    const respond = (body: unknown, status: number, result: string) => {
      logger({
        requestId,
        operation: "road.context.http",
        provider: "internal",
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
      return fail(401, "unauthorized", "Valid server credentials are required");
    if (request.method !== "POST") return fail(405, "method_not_allowed", "Use POST");
    if (
      request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !==
      "application/json"
    )
      return fail(415, "unsupported_media_type", "Use application/json");
    const declared = request.headers.get("content-length");
    if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > MAX_CONTEXT_BODY_BYTES))
      return fail(413, "body_too_large", "The request exceeds its size limit");
    let input: unknown;
    try {
      input = await readBoundedJson(request, MAX_CONTEXT_BODY_BYTES);
    } catch (error) {
      return error instanceof RangeError
        ? fail(413, "body_too_large", "The request exceeds its size limit")
        : fail(400, "invalid_json", "Valid JSON is required");
    }
    const parsed = roadContextRequestSchema.safeParse(input);
    if (!parsed.success)
      return fail(
        400,
        "invalid_request",
        "Provide a pin, place name, or official_alerts request only",
      );
    try {
      const result = roadContextResponseSchema.parse(await execute(parsed.data, requestId));
      return respond(result, result.state === "unavailable" ? 503 : 200, result.state);
    } catch {
      return fail(
        503,
        "context_unavailable",
        "Los datos viales no están disponibles. Intenta más tarde.",
      );
    }
  };
}
