import { env } from "@/config/env";
import { loadBundledAlertsSnapshot } from "@/integrations/sutran/snapshot";
import { createSutranClient } from "@/integrations/sutran/sutran-client";

import { createRoadAlertsService } from "./road-alerts-service";

// Process-wide service instances used by route handlers. The in-memory cache lives
// for the lifetime of a server instance.
export const roadAlertsService = createRoadAlertsService({
  provider: createSutranClient({ baseUrl: env.SUTRAN_API_BASE }),
  snapshot: loadBundledAlertsSnapshot(),
});
