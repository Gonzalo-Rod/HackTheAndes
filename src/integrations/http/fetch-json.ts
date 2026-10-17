import { logger } from "@/lib/logger";

// Shared wrapper for every external HTTP call (AGENTS.md, "External calls"):
// explicit timeout, at most two retries with exponential backoff and jitter, retries only
// for network errors, timeouts, 429 and 5xx, GET only (idempotent), structured logging.

/** Per-attempt timeout required by the repository rules. */
export const DEFAULT_TIMEOUT_MS = 8_000;
/** Upper bound on retries required by the repository rules (three attempts in total). */
export const MAX_RETRIES = 2;
/** First backoff step; doubles per retry, plus up to the same amount of random jitter. */
const BASE_BACKOFF_MS = 400;

export type UpstreamErrorKind = "timeout" | "network" | "http" | "invalid_body";

export class UpstreamError extends Error {
  constructor(
    message: string,
    readonly kind: UpstreamErrorKind,
    readonly provider: string,
    readonly status?: number,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "UpstreamError";
  }
}

export interface RequestOptions {
  provider: string;
  operation: string;
  timeoutMs?: number;
  retries?: number;
  requestId?: string;
  headers?: Record<string, string>;
  /** Injectable for tests. */
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

type Attempt<T> = { ok: true; value: T } | { ok: false; error: UpstreamError };

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function backoffDelayMs(retry: number, random: () => number = Math.random): number {
  const base = BASE_BACKOFF_MS * 2 ** (retry - 1);
  return base + random() * base;
}

function isRetryable(error: UpstreamError): boolean {
  if (error.kind === "timeout" || error.kind === "network") return true;
  return error.kind === "http" && error.status !== undefined && (error.status === 429 || error.status >= 500);
}

function describeTarget(url: string): string {
  try {
    const parsed = new URL(url, "http://local");
    return parsed.host === "local" ? parsed.pathname : `${parsed.host}${parsed.pathname}`;
  } catch {
    return "invalid-url";
  }
}

async function attemptOnce<T>(url: string, options: RequestOptions, parse: (response: Response) => Promise<T>): Promise<Attempt<T>> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { method: "GET", headers: options.headers, signal: controller.signal, cache: "no-store" });
    if (!response.ok) {
      return { ok: false, error: new UpstreamError(`HTTP ${response.status}`, "http", options.provider, response.status) };
    }
    try {
      return { ok: true, value: await parse(response) };
    } catch {
      return { ok: false, error: new UpstreamError("Respuesta con formato inválido", "invalid_body", options.provider) };
    }
  } catch (error) {
    const timedOut = controller.signal.aborted;
    // Messages reach users; runtime error text (e.g. Node's "fetch failed") is English and opaque.
    const message = timedOut ? `Sin respuesta en ${Math.round(timeoutMs / 1000)} s` : "no se pudo conectar";
    return {
      ok: false,
      error: new UpstreamError(message, timedOut ? "timeout" : "network", options.provider, undefined, { cause: error }),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function requestWithRetry<T>(url: string, options: RequestOptions, parse: (response: Response) => Promise<T>): Promise<T> {
  const retries = Math.min(options.retries ?? MAX_RETRIES, MAX_RETRIES);
  const sleep = options.sleep ?? defaultSleep;
  const started = Date.now();
  let lastError: UpstreamError | null = null;
  let attempts = 0;

  for (let retry = 0; retry <= retries; retry++) {
    if (retry > 0) await sleep(backoffDelayMs(retry, options.random));
    attempts++;
    const attempt = await attemptOnce(url, options, parse);
    if (attempt.ok) {
      logger.info({
        operation: options.operation,
        provider: options.provider,
        requestId: options.requestId,
        target: describeTarget(url),
        durationMs: Date.now() - started,
        attempts,
        result: "ok",
      });
      return attempt.value;
    }
    lastError = attempt.error;
    if (!isRetryable(attempt.error)) break;
  }

  // lastError is always set here: the loop runs at least once and only exits early on failure.
  const error = lastError ?? new UpstreamError("Error desconocido", "network", options.provider);
  logger.warn({
    operation: options.operation,
    provider: options.provider,
    requestId: options.requestId,
    target: describeTarget(url),
    durationMs: Date.now() - started,
    attempts,
    result: "error",
    errorKind: error.kind,
    status: error.status,
  });
  throw error;
}

/** GET a JSON document. Throws UpstreamError after the retry budget is spent. */
export function getJson(url: string, options: RequestOptions): Promise<unknown> {
  return requestWithRetry(url, options, (response) => response.json() as Promise<unknown>);
}

/** GET a binary document (used by the offline data build for terrain tiles). */
export function getArrayBuffer(url: string, options: RequestOptions): Promise<ArrayBuffer> {
  return requestWithRetry(url, options, (response) => response.arrayBuffer());
}
