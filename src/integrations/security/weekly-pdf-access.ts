import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
const tokenSchema = z
  .object({ id: z.uuid(), expires: z.coerce.number().int().positive(), signature: z.string().regex(/^[a-f0-9]{64}$/) })
  .strict();
function signature(id: string, expires: number, secret: string) {
  return createHmac("sha256", secret).update(`weekly-pdf:v1:${id}:${expires}`).digest("hex");
}
export function weeklyPdfUrl(origin: string, id: string, expires: number, secret: string) {
  z.uuid().parse(id);
  const url = new URL(`/api/reports/pdf/${id}`, origin);
  url.searchParams.set("expires", String(expires));
  url.searchParams.set("signature", signature(id, expires, secret));
  return url.toString();
}
export function verifyWeeklyPdfAccess(input: unknown, secret: string, nowMs: number) {
  const parsed = tokenSchema.safeParse(input);
  if (!parsed.success || parsed.data.expires <= nowMs || parsed.data.expires - nowMs > 72 * 3_600_000) return null;
  const { id, expires } = parsed.data;
  return timingSafeEqual(Buffer.from(signature(id, expires, secret), "hex"), Buffer.from(parsed.data.signature, "hex")) ? id : null;
}
