import { createHmac } from "node:crypto";
import { equalDigest } from "./contacts";

// The caller supplies the provider's documented signing bytes, including its timestamp.
// This helper does not guess a provider-specific canonicalization or header format.
export function verifyHmacSignature(signingBytes: Uint8Array, signatureHex: string | null, secret: string): boolean {
  const expected = createHmac("sha256", secret).update(signingBytes).digest("hex");
  return signatureHex !== null && equalDigest(signatureHex, expected);
}

// Five minutes is the application's default replay window; providers can override it.
export const DEFAULT_REPLAY_WINDOW_MS = 5 * 60_000;
export function timestampWithinWindow(timestampMs: number, nowMs: number, windowMs = DEFAULT_REPLAY_WINDOW_MS): boolean {
  return Number.isFinite(timestampMs) && Number.isFinite(nowMs) && windowMs > 0 && Math.abs(nowMs - timestampMs) <= windowMs;
}

export interface WebhookDeduplicator {
  /** Atomically claim only after signature verification. False means already processed. */
  claim(provider: string, eventId: string): Promise<boolean>;
}
