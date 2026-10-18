import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { HttpTransportError, type JsonRequestOptions } from "./json-transport.ts";

import {
  DEFAULT_TIMEOUT_MS,
  MAX_TIMEOUT_MS,
  MAX_RETRIES,
  INITIAL_RETRY_DELAY_MS,
  MAX_RETRY_DELAY_MS,
} from "./policy.ts";

export interface BinaryTransport {
  getBytes(url: string, options?: JsonRequestOptions): Promise<Uint8Array>;
}
// This operator-only transport downloads continental GIS archives, not API job payloads.
const MAX_ARCHIVE_BYTES = 100 * 1024 * 1024;
export function createBinaryTransport(
  options: {
    fetch?: typeof fetch;
    timeoutMs?: number;
    maxBytes?: number;
    sleep?: (ms: number) => Promise<void>;
    random?: () => number;
    logger?: (entry: Record<string, unknown>) => void;
  } = {},
): BinaryTransport {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? MAX_ARCHIVE_BYTES;
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > MAX_TIMEOUT_MS)
    throw new RangeError("Invalid archive timeout");
  if (!Number.isInteger(maxBytes) || maxBytes <= 0 || maxBytes > MAX_ARCHIVE_BYTES)
    throw new RangeError("Invalid archive byte limit");
  const fetchImpl = options.fetch ?? fetch;
  const logger = options.logger ?? ((entry) => console.error(JSON.stringify(entry)));
  return {
    async getBytes(url, request = {}) {
      const requestId = request.requestId ?? randomUUID();
      for (let attempt = 0; ; attempt++) {
        request.signal?.throwIfAborted();
        const started = performance.now();
        const timeout = AbortSignal.timeout(timeoutMs);
        const signal = request.signal ? AbortSignal.any([request.signal, timeout]) : timeout;
        const metadata = {
          requestId,
          operation: "http.get_binary",
          provider: request.provider ?? "archive",
          attempt: attempt + 1,
        };
        try {
          const response = await fetchImpl(url, {
            method: "GET",
            cache: "no-store",
            redirect: "error",
            signal,
          });
          if (!response.ok) {
            await response.body?.cancel();
            const retryHeader = response.headers.get("Retry-After");
            const retryAfterMs =
              retryHeader && /^\d+$/.test(retryHeader) ? Number(retryHeader) * 1000 : null;
            throw new HttpTransportError("http", response.status, retryAfterMs);
          }
          const reader = response.body?.getReader();
          if (!reader) throw new Error("Archive body unavailable");
          const chunks: Uint8Array[] = [];
          let size = 0;
          try {
            while (true) {
              const { value, done } = await reader.read();
              if (done) break;
              size += value.byteLength;
              if (size > maxBytes) {
                await reader.cancel();
                throw new RangeError("Archive exceeds byte limit");
              }
              chunks.push(value);
            }
          } finally {
            reader.releaseLock();
          }
          const bytes = new Uint8Array(size);
          let offset = 0;
          for (const chunk of chunks) {
            bytes.set(chunk, offset);
            offset += chunk.byteLength;
          }
          logger({
            ...metadata,
            durationMs: performance.now() - started,
            result: "success",
            bytes: size,
          });
          return bytes;
        } catch (error) {
          request.signal?.throwIfAborted();
          const failure = timeout.aborted
            ? new HttpTransportError("timeout")
            : error instanceof TypeError
              ? new HttpTransportError("network")
              : error;
          logger({
            ...metadata,
            durationMs: performance.now() - started,
            result: "failure",
            errorType: failure instanceof HttpTransportError ? failure.kind : "invalid_archive",
          });
          if (
            !(failure instanceof HttpTransportError) ||
            !failure.retryable ||
            attempt >= MAX_RETRIES
          )
            throw failure;
          const waitMs = Math.max(
            INITIAL_RETRY_DELAY_MS * 2 ** attempt +
              (options.random ?? Math.random)() * INITIAL_RETRY_DELAY_MS,
            failure.retryAfterMs ?? 0,
          );
          if (waitMs > MAX_RETRY_DELAY_MS) throw failure;
          await (options.sleep ?? delay)(waitMs);
        }
      }
    },
  };
}
