import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const SESSION_COOKIE = "peruroad_session";
const SessionSchema = z
  .object({ organizationId: z.uuid(), issuedAtMs: z.number().int().nonnegative(), expiresAtMs: z.number().int().positive() })
  .strict();
export type OrganizationSession = z.infer<typeof SessionSchema>;
// A short session limits damage if a demo access code or cookie is shared.
export const SESSION_DURATION_MS = 4 * 60 * 60_000;
function signature(payload: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(`session-v1.${payload}`).digest();
}
export function signSession(session: OrganizationSession, secret: string): string {
  const payload = Buffer.from(JSON.stringify(SessionSchema.parse(session))).toString("base64url");
  return `${payload}.${signature(payload, secret).toString("base64url")}`;
}
export function readSession(token: string | undefined, secret: string, nowMs: number): OrganizationSession | null {
  if (!token || token.length > 1024) return null;
  const [payload, mac, extra] = token.split(".");
  if (!payload || !mac || extra !== undefined || !/^[A-Za-z0-9_-]{43}$/.test(mac)) return null;
  const actual = Buffer.from(mac, "base64url");
  const expected = signature(payload, secret);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const session = SessionSchema.parse(JSON.parse(Buffer.from(payload, "base64url").toString("utf8")));
    return session.issuedAtMs <= nowMs && nowMs < session.expiresAtMs && session.expiresAtMs - session.issuedAtMs <= SESSION_DURATION_MS
      ? session
      : null;
  } catch {
    return null; // An authenticated but malformed/expired cookie is an expected invalid session.
  }
}
