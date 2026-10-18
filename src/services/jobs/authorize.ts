import { createHash, timingSafeEqual } from "node:crypto";
import { loadNotificationConfiguration } from "@/config/env";
import { failure } from "@/services/platform/http";
export function authorizeJob(request: Request) {
  const secret = loadNotificationConfiguration().jobSecret;
  const hash = (value: string) => createHash("sha256").update(value).digest();
  if (!timingSafeEqual(hash(request.headers.get("authorization") ?? ""), hash(`Bearer ${secret}`)))
    failure(401, "unauthorized", "Autenticación requerida.");
}
