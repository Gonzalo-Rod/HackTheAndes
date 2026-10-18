import { loadGeometryRevision, loadPlatformConfiguration } from "@/config/env";
import { database } from "@/db/pool";
import { createAccessRepository } from "@/db/access";
import { createDashboardRepository } from "@/db/dashboard";
import { createRateLimiter } from "@/db/request-limits";
import { createWaitlistRepository } from "@/db/waitlist";
import { createAccessService } from "./access";
import { createWaitlistService } from "./waitlist";

export function dashboardRepository() {
  return createDashboardRepository(database(), loadGeometryRevision());
}
export function accessService() {
  const config = loadPlatformConfiguration();
  return createAccessService({
    repository: createAccessRepository(database()),
    limiter: createRateLimiter(database()),
    secret: config.SESSION_SIGNING_SECRET,
    now: Date.now,
  });
}
export function waitlistService() {
  return createWaitlistService({
    repository: createWaitlistRepository(database()),
    limiter: createRateLimiter(database()),
    config: loadPlatformConfiguration(),
    now: Date.now,
  });
}
