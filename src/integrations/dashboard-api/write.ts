import { z } from "zod";
import { logger } from "@/lib/logger";

export async function postDashboard<T>(path: "/api/access" | "/api/waitlist", body: unknown, schema: z.ZodType<T>): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  const started = performance.now();
  const requestId = crypto.randomUUID();
  try {
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
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
      operation: path === "/api/access" ? "access.login" : "waitlist.join",
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
