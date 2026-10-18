import { z } from "zod";
import { logger } from "@/lib/logger";

const OPERATIONS = {
  "/api/access": "access.login",
  "/api/waitlist": "waitlist.join",
  "/api/company/trips": "route_watch.register",
} as const;

export async function postDashboard<T>(path: keyof typeof OPERATIONS, body: unknown, schema: z.ZodType<T>): Promise<T> {
  return sendDashboard("POST", path, OPERATIONS[path], body, schema);
}

/** Stops one of the organization's route watches. */
export async function cancelRouteWatch(id: string): Promise<void> {
  await sendDashboard(
    "DELETE",
    `/api/company/trips/${encodeURIComponent(id)}`,
    "route_watch.cancel",
    undefined,
    z.object({ cancelled: z.literal(true) }),
  );
}

async function sendDashboard<T>(
  method: "POST" | "DELETE",
  path: string,
  operation: string,
  body: unknown,
  schema: z.ZodType<T>,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  const started = performance.now();
  const requestId = crypto.randomUUID();
  try {
    const response = await fetch(path, {
      method,
      ...(method === "POST" ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
      signal: controller.signal,
      cache: "no-store",
      redirect: "error",
    });
    const json: unknown = await response.json();
    if (!response.ok) {
      const parsed = z.object({ error: z.object({ message: z.string() }) }).safeParse(json);
      throw new Error(parsed.success ? parsed.data.error.message : "No se pudo guardar. Intenta más tarde.");
    }
    return schema.parse(json);
  } catch (error) {
    logger.warn({
      requestId,
      operation,
      provider: "dashboard-api",
      durationMs: performance.now() - started,
      result: "error",
      errorType: controller.signal.aborted ? "timeout" : "request_failed",
    });
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
