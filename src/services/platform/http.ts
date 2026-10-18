import { randomUUID } from "node:crypto";
import { isIP } from "node:net";
import { z } from "zod";
import { isVercelRuntime } from "@/config/env";
import { logger } from "@/lib/logger";
import { keyedDigest } from "@/integrations/security/contacts";

export class RequestFailure extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
export function failure(status: number, code: string, message: string): never {
  throw new RequestFailure(status, code, message);
}
export async function readJson<T>(request: Request, schema: z.ZodType<T>, maxBytes = 4096): Promise<T> {
  if (request.headers.get("content-type")?.split(";")[0]?.trim() !== "application/json")
    failure(415, "invalid_content_type", "Envía JSON.");
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) failure(403, "invalid_origin", "Origen no permitido.");
  const reader = request.body?.getReader();
  if (!reader) failure(400, "invalid_input", "Faltan datos.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        failure(413, "body_too_large", "Los datos exceden el límite.");
      }
      chunks.push(value);
    }
    const parsed = schema.safeParse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    if (!parsed.success) failure(400, "invalid_input", "Revisa los datos enviados.");
    return parsed.data;
  } catch (error) {
    if (error instanceof RequestFailure) throw error;
    return failure(400, "invalid_input", "Revisa los datos enviados.");
  } finally {
    reader.releaseLock();
  }
}
export function requestBucket(request: Request, secret: string, purpose: string): string {
  // Vercel overwrites this header at its edge. Other hosts share a conservative bucket.
  const forwarded = isVercelRuntime() ? request.headers.get("x-vercel-forwarded-for") : null;
  const address = forwarded && isIP(forwarded) ? forwarded : "shared-local";
  return keyedDigest(address, secret, `rate:${purpose}`);
}
export function platformRoute(operation: string, execute: (request: Request) => Promise<Response>) {
  return async (request: Request): Promise<Response> => {
    const requestId = randomUUID();
    const start = performance.now();
    try {
      const response = await execute(request);
      response.headers.set("Cache-Control", "no-store");
      response.headers.set("X-Request-Id", requestId);
      logger.info({
        requestId,
        operation,
        provider: "supabase",
        durationMs: performance.now() - start,
        result: "ok",
        status: response.status,
      });
      return response;
    } catch (error) {
      const expected = error instanceof RequestFailure;
      const status = expected ? error.status : 503;
      logger.warn({
        requestId,
        operation,
        provider: "supabase",
        durationMs: performance.now() - start,
        result: "error",
        errorType: expected ? error.code : error instanceof Error ? error.name : "UnknownError",
        status,
      });
      return Response.json(
        {
          error: {
            code: expected ? error.code : "service_unavailable",
            message: expected ? error.message : "Servicio no disponible. Intenta más tarde.",
          },
        },
        {
          status,
          headers: { "Cache-Control": "no-store", "X-Request-Id": requestId, ...(status === 429 ? { "Retry-After": "900" } : {}) },
        },
      );
    }
  };
}
