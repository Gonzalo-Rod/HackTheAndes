import { randomUUID } from "node:crypto";
import { parseRoadContextClientConfiguration } from "../../config/env.ts";
import {
  roadContextRequestSchema,
  roadContextResponseSchema,
  type RoadContextResponse,
} from "../../contracts/road-context.ts";
import { postJson } from "../http/post-json.ts";
import { HttpTransportError } from "../http/json-transport.ts";

export type RoadContextClientResult =
  | { ok: true; value: RoadContextResponse }
  | {
      ok: false;
      error: { code: "invalid_request" | "unauthorized" | "unavailable"; message: string };
    };
export function createRoadContextClient({
  baseUrl,
  secret,
  post = postJson,
}: {
  baseUrl: string;
  secret: string;
  post?: typeof postJson;
}) {
  const config = parseRoadContextClientConfiguration({
    ROAD_DATA_API_URL: baseUrl,
    ROAD_DATA_API_SECRET: secret,
  });
  const url = new URL("/api/internal/road-context", config.ROAD_DATA_API_URL).href;
  return {
    async request(
      input: unknown,
      options: { requestId?: string; signal?: AbortSignal } = {},
    ): Promise<RoadContextClientResult> {
      const parsed = roadContextRequestSchema.safeParse(input);
      if (!parsed.success)
        return {
          ok: false,
          error: {
            code: "invalid_request",
            message: "Provide only a place name, pin, or official-alert request; never sender data",
          },
        };
      try {
        const payload = await post(url, parsed.data, {
          ...options,
          requestId: options.requestId ?? randomUUID(),
          provider: "peruroad-context",
          headers: { Authorization: `Bearer ${config.ROAD_DATA_API_SECRET}` },
        });
        const result = roadContextResponseSchema.safeParse(payload);
        if (!result.success)
          return {
            ok: false,
            error: {
              code: "unavailable",
              message: "Los datos viales no están disponibles. Intenta más tarde.",
            },
          };
        return { ok: true, value: result.data };
      } catch (error) {
        return {
          ok: false,
          error: {
            code:
              error instanceof HttpTransportError && error.status === 401
                ? "unauthorized"
                : "unavailable",
            message: "Los datos viales no están disponibles. Intenta más tarde.",
          },
        };
      }
    },
  };
}
