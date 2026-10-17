// AGENTS.md: interactive calls default to 8 s, with at most two idempotent retries.
export const DEFAULT_TIMEOUT_MS = 8_000;
// Explicit longer timeouts are reserved for bounded operator/bulk jobs.
export const MAX_TIMEOUT_MS = 120_000;
export const MAX_RETRIES = 2;
export const INITIAL_RETRY_DELAY_MS = 250;
// Reject a longer Retry-After rather than keeping a serverless invocation waiting.
export const MAX_RETRY_DELAY_MS = 30_000;
