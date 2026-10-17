import { DEFAULT_REPLAY_WINDOW_MS, timestampWithinWindow, verifyHmacSignature } from "@/integrations/security/webhook";

// Zavu's `X-Zavu-Signature` header: `t=<unix seconds>,v1=<hex>,v2=<hex>`.
// v2 signs `{t}.{rawBody}` and is preferred; v1 signs the raw body alone.
// See https://docs.zavu.dev/guides/receiving-messages/security.

export type SignatureFailure = "missing_header" | "malformed_header" | "stale_timestamp" | "mismatch";
export type SignatureCheck = { valid: true } | { valid: false; reason: SignatureFailure };

function parseHeader(header: string): Record<string, string> {
  const parts: Record<string, string> = {};
  for (const piece of header.split(",")) {
    const separator = piece.indexOf("=");
    // Unknown parts are kept but ignored, so a future scheme does not break parsing.
    if (separator > 0) parts[piece.slice(0, separator).trim()] = piece.slice(separator + 1).trim();
  }
  return parts;
}

export function verifyZavuSignature(params: {
  rawBody: string;
  header: string | null;
  secret: string;
  nowMs: number;
  replayWindowMs?: number;
}): SignatureCheck {
  const { rawBody, header, secret, nowMs } = params;
  if (!header) return { valid: false, reason: "missing_header" };

  const parts = parseHeader(header);
  const timestampSeconds = Number(parts.t);
  const received = parts.v2 ?? parts.v1;
  if (!parts.t || !Number.isInteger(timestampSeconds) || !received) return { valid: false, reason: "malformed_header" };

  if (!timestampWithinWindow(timestampSeconds * 1000, nowMs, params.replayWindowMs ?? DEFAULT_REPLAY_WINDOW_MS)) {
    return { valid: false, reason: "stale_timestamp" };
  }

  const signedPayload = parts.v2 ? `${parts.t}.${rawBody}` : rawBody;
  const valid = verifyHmacSignature(new TextEncoder().encode(signedPayload), received, secret);
  return valid ? { valid: true } : { valid: false, reason: "mismatch" };
}
