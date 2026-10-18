import { randomUUID } from "node:crypto";
import {
  HttpTransportError,
  type HttpLogEntry,
  type JsonRequestOptions,
} from "./json-transport.ts";

// Mutations are never retried automatically: a timeout may have committed remotely.
const POST_TIMEOUT_MS = 8_000;
export async function postJson(
  url: string,
  body: unknown,
  request: JsonRequestOptions = {},
  logger: (entry: HttpLogEntry) => void = (entry) => console.error(JSON.stringify(entry)),
): Promise<unknown> {
  const requestId = request.requestId ?? randomUUID();
  const provider = request.provider ?? new URL(url).hostname;
  const startedAt = performance.now();
  const timeout = AbortSignal.timeout(POST_TIMEOUT_MS);
  const signal = request.signal ? AbortSignal.any([request.signal, timeout]) : timeout;
  try {
    request.signal?.throwIfAborted();
    const response = await fetch(url, {
      method: "POST",
      redirect: "error",
      headers: {
        ...request.headers,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal,
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new HttpTransportError("http", response.status);
    }
    let value: unknown;
    try {
      value = await response.json();
    } catch {
      if (signal.aborted) throw signal.reason;
      throw new HttpTransportError("invalid_json");
    }
    logger({
      requestId,
      operation: "http.post_json",
      provider,
      durationMs: performance.now() - startedAt,
      attempt: 1,
      result: "success",
    });
    return value;
  } catch (error) {
    const failure =
      error instanceof HttpTransportError
        ? error
        : new HttpTransportError(timeout.aborted ? "timeout" : "network");
    logger({
      requestId,
      operation: "http.post_json",
      provider,
      durationMs: performance.now() - startedAt,
      attempt: 1,
      result: "failure",
      errorType: request.signal?.aborted ? "cancelled" : failure.kind,
      status: failure.status,
    });
    request.signal?.throwIfAborted();
    throw failure;
  }
}
