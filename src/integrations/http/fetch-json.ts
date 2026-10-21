import { logger } from "@/lib/logger";

// Shared wrapper for every external HTTP call (AGENTS.md, "External calls"):
// explicit timeout, at most two retries with exponential backoff and jitter, retries only
// for network errors, timeouts, 429 and 5xx, and only for idempotent requests (GET, or a POST
// the caller marks idempotent because it carries a provider idempotency key), structured logging.

/** Per-attempt timeout required by the repository rules. */
export const DEFAULT_TIMEOUT_MS = 8_000;
/** Upper bound on retries required by the repository rules (three attempts in total). */
export const MAX_RETRIES = 2;
/** First backoff step; doubles per retry, plus up to the same amount of random jitter. */
const BASE_BACKOFF_MS = 400;

export type UpstreamErrorKind = "timeout" | "network" | "http" | "invalid_body";

export class UpstreamError extends Error {
  /** Parsed error body of an HTTP failure, for adapters that map provider error codes. Never logged. */
  readonly responseBody?: unknown;

  constructor(
    message: string,
    readonly kind: UpstreamErrorKind,
    readonly provider: string,
    readonly status?: number,
    options?: { cause?: unknown; responseBody?: unknown },
  ) {
    super(message, options);
    this.name = "UpstreamError";
    this.responseBody = options?.responseBody;
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
  /** Non-2xx statuses the caller treats as a normal answer (e.g. 409 replaying an idempotent send). */
  acceptStatuses?: readonly number[];
  redirect?: RequestRedirect;
  /** Hide stored media paths from structured logs. */
  logTarget?: string;
}

type HttpMethod =
  | { method: "GET" }
  | { method: "DELETE" }
  | { method: "POST"; body: unknown }
  | { method: "FORM"; body: FormData }
  | { method: "URLENCODED"; body: URLSearchParams };

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

async function readErrorBody(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch {
    // Error pages are not always JSON; the status alone still describes the failure.
    return undefined;
  }
}

function buildInit(request: HttpMethod, options: RequestOptions, signal: AbortSignal): RequestInit {
  if (request.method === "GET" || request.method === "DELETE")
    return { method: request.method, headers: options.headers, signal, cache: "no-store", redirect: options.redirect };
  if (request.method === "FORM")
    return { method: "POST", body: request.body, headers: options.headers, signal, redirect: options.redirect };
  if (request.method === "URLENCODED")
    return {
      method: "POST",
      body: request.body.toString(),
      headers: { "Content-Type": "application/x-www-form-urlencoded", ...options.headers },
      signal,
      redirect: "error",
    };
  return {
    method: "POST",
    headers: { "Content-Type": "application/json", ...options.headers },
    body: JSON.stringify(request.body),
    signal,
    cache: "no-store",
    redirect: options.redirect,
  };
}

async function attemptOnce<T>(
  url: string,
  request: HttpMethod,
  options: RequestOptions,
  parse: (response: Response) => Promise<T>,
): Promise<Attempt<T>> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, buildInit(request, options, controller.signal));
    const accepted = response.ok || (options.acceptStatuses ?? []).includes(response.status);
    if (!accepted) {
      const responseBody = await readErrorBody(response);
      return {
        ok: false,
        error: new UpstreamError(`HTTP ${response.status}`, "http", options.provider, response.status, { responseBody }),
      };
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

async function requestWithRetry<T>(
  url: string,
  request: HttpMethod,
  options: RequestOptions,
  parse: (response: Response) => Promise<T>,
): Promise<T> {
  const retries = Math.min(options.retries ?? MAX_RETRIES, MAX_RETRIES);
  const sleep = options.sleep ?? defaultSleep;
  const started = Date.now();
  let lastError: UpstreamError | null = null;
  let attempts = 0;

  for (let retry = 0; retry <= retries; retry++) {
    if (retry > 0) await sleep(backoffDelayMs(retry, options.random));
    attempts++;
    const attempt = await attemptOnce(url, request, options, parse);
    if (attempt.ok) {
      logger.info({
        operation: options.operation,
        provider: options.provider,
        requestId: options.requestId,
        target: options.logTarget ?? describeTarget(url),
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
    target: options.logTarget ?? describeTarget(url),
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
  return requestWithRetry(url, { method: "GET" }, options, (response) => response.json() as Promise<unknown>);
}

/** DELETE a resource; DELETE is idempotent, so the normal retry budget applies. */
export function deleteJson(url: string, options: RequestOptions): Promise<unknown> {
  return requestWithRetry(url, { method: "DELETE" }, options, async (response) => {
    const text = await response.text();
    return text ? (JSON.parse(text) as unknown) : null;
  });
}

/** GET a binary document (used by the offline data build for terrain tiles). */
export function getArrayBuffer(url: string, options: RequestOptions): Promise<ArrayBuffer> {
  return requestWithRetry(url, { method: "GET" }, options, (response) => response.arrayBuffer());
}

export interface JsonResponse {
  status: number;
  body: unknown;
}

/**
 * POST a JSON body. Retries only when `idempotent` is true, i.e. the provider deduplicates
 * the request (for example through an idempotency key); otherwise a timeout could send twice.
 * Throws UpstreamError after the retry budget is spent.
 */
export function postJson(url: string, body: unknown, options: RequestOptions & { idempotent: boolean }): Promise<JsonResponse> {
  const retries = options.idempotent ? options.retries : 0;
  return requestWithRetry(url, { method: "POST", body }, { ...options, retries }, async (response) => {
    const text = await response.text();
    return { status: response.status, body: text ? (JSON.parse(text) as unknown) : null };
  });
}

/** Non-idempotent transcription uploads are never retried automatically. */
export function postForm(url: string, body: FormData, options: RequestOptions): Promise<unknown> {
  return requestWithRetry(url, { method: "FORM", body }, { ...options, retries: 0 }, (r) => r.json() as Promise<unknown>);
}
/** OAuth client-credentials exchanges do not retry a POST implicitly. */
export function postUrlEncoded(url: string, body: URLSearchParams, options: RequestOptions): Promise<unknown> {
  return requestWithRetry(
    url,
    { method: "URLENCODED", body },
    { ...options, retries: 0 },
    (response) => response.json() as Promise<unknown>,
  );
}
/** Stream with a hard byte limit; redirect following is disabled for stored media URLs. */
export function getBoundedAudio(url: string, maxBytes: number, options: RequestOptions): Promise<{ bytes: Uint8Array; mimeType: string }> {
  return requestWithRetry(url, { method: "GET" }, { ...options, redirect: "error" }, async (response) => {
    const declared = Number(response.headers.get("content-length") ?? 0);
    if (declared > maxBytes || !response.body) throw new Error("Audio exceeds limit or is empty");
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.byteLength;
        if (size > maxBytes) {
          await reader.cancel();
          throw new Error("Audio exceeds limit");
        }
        chunks.push(part.value);
      }
    } finally {
      reader.releaseLock();
    }
    if (!size) throw new Error("Empty audio");
    return { bytes: new Uint8Array(Buffer.concat(chunks)), mimeType: response.headers.get("content-type")?.split(";")[0] ?? "" };
  });
}
