import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

import {
  DEFAULT_TIMEOUT_MS,
  MAX_TIMEOUT_MS,
  MAX_RETRIES,
  INITIAL_RETRY_DELAY_MS,
  MAX_RETRY_DELAY_MS,
} from "./policy.ts";

export interface JsonRequestOptions {
  signal?: AbortSignal;
  provider?: string;
  requestId?: string;
  headers?: Readonly<Record<string, string>>;
}

export interface JsonTransport {
  getJson(url: string, options?: JsonRequestOptions): Promise<unknown>;
}

export type HttpFailure = "http" | "network" | "timeout" | "invalid_json";

export class HttpTransportError extends Error {
  readonly kind: HttpFailure;
  readonly status: number | null;
  readonly retryable: boolean;
  readonly retryAfterMs: number | null;

  constructor(kind: HttpFailure, status: number | null = null, retryAfterMs: number | null = null) {
    super(status === null ? `JSON request failed: ${kind}` : `JSON request failed: HTTP ${status}`);
    this.name = "HttpTransportError";
    this.kind = kind;
    this.status = status;
    this.retryAfterMs = retryAfterMs;
    this.retryable =
      kind === "network" ||
      kind === "timeout" ||
      (kind === "http" && (status === 429 || (status !== null && status >= 500)));
  }
}

export interface HttpLogEntry {
  requestId: string;
  operation: "http.get_json" | "http.post_json";
  provider: string;
  durationMs: number;
  attempt: number;
  result: "success" | "failure";
  errorType?: HttpFailure | "cancelled";
  status?: number | null;
}

interface TransportOptions {
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
  maxRetries?: number;
  logger?: (entry: HttpLogEntry) => void;
  sleep?: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
  random?: () => number;
}

function retryAfterMilliseconds(value: string | null): number | null {
  if (value === null) return null;
  if (/^\d+$/.test(value.trim())) return Number(value) * 1000;
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : null;
}

async function fetchJson(
  url: string,
  request: JsonRequestOptions,
  fetchImpl: typeof globalThis.fetch,
  timeoutMs: number,
): Promise<unknown> {
  request.signal?.throwIfAborted();
  const timeout = AbortSignal.timeout(timeoutMs);
  const signal = request.signal ? AbortSignal.any([request.signal, timeout]) : timeout;
  try {
    const response = await fetchImpl(url, {
      method: "GET",
      headers: { ...request.headers, Accept: "application/json" },
      cache: "no-store",
      signal,
    });
    if (!response.ok) {
      const retryAfterMs = retryAfterMilliseconds(response.headers.get("Retry-After"));
      await response.body?.cancel();
      throw new HttpTransportError("http", response.status, retryAfterMs);
    }
    try {
      return (await response.json()) as unknown;
    } catch {
      if (signal.aborted) throw signal.reason;
      throw new HttpTransportError("invalid_json");
    }
  } catch (error) {
    request.signal?.throwIfAborted();
    if (timeout.aborted) throw new HttpTransportError("timeout");
    if (error instanceof HttpTransportError) throw error;
    throw new HttpTransportError("network");
  }
}

/** GET-only wrapper: retries are safe here; no caller should wrap it in another retry loop. */
export function createFetchJsonTransport(options: TransportOptions = {}): JsonTransport {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRetries = options.maxRetries ?? MAX_RETRIES;
  const logger = options.logger ?? ((entry: HttpLogEntry) => console.error(JSON.stringify(entry)));
  const sleep =
    options.sleep ??
    (async (milliseconds: number, signal?: AbortSignal) => {
      await delay(milliseconds, undefined, signal ? { signal } : {});
    });
  const random = options.random ?? Math.random;
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > MAX_TIMEOUT_MS) {
    throw new RangeError("timeoutMs must be an integer between 1 and 120000");
  }
  if (!Number.isInteger(maxRetries) || maxRetries < 0 || maxRetries > MAX_RETRIES) {
    throw new RangeError("maxRetries must be an integer between 0 and 2");
  }

  return {
    async getJson(url, request = {}) {
      const requestId = request.requestId ?? randomUUID();
      const provider = request.provider ?? new URL(url).hostname;
      for (let attempt = 0; ; attempt++) {
        const startedAt = performance.now();
        const metadata = {
          requestId,
          operation: "http.get_json" as const,
          provider,
          attempt: attempt + 1,
        };
        try {
          const result = await fetchJson(url, request, fetchImpl, timeoutMs);
          logger({ ...metadata, durationMs: performance.now() - startedAt, result: "success" });
          return result;
        } catch (error) {
          const failure = error instanceof HttpTransportError ? error : null;
          logger({
            ...metadata,
            durationMs: performance.now() - startedAt,
            result: "failure",
            errorType: failure?.kind ?? "cancelled",
            status: failure?.status ?? null,
          });
          request.signal?.throwIfAborted();
          if (!failure?.retryable || attempt >= maxRetries) throw error;
          const backoffMs =
            INITIAL_RETRY_DELAY_MS * 2 ** attempt + random() * INITIAL_RETRY_DELAY_MS;
          const waitMs = Math.max(backoffMs, failure.retryAfterMs ?? 0);
          if (waitMs > MAX_RETRY_DELAY_MS) throw error;
          try {
            await sleep(waitMs, request.signal);
          } catch (sleepError) {
            request.signal?.throwIfAborted();
            throw sleepError;
          }
        }
      }
    },
  };
}
