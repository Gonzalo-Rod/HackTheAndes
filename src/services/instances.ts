import { readFile } from "node:fs/promises";
import path from "node:path";

import { env } from "@/config/env";
import { CorridorDataSchema, type CorridorData } from "@/contracts/corridor";
import { createOpenMeteoClient } from "@/integrations/open-meteo/open-meteo-client";
import { loadBundledAlertsSnapshot } from "@/integrations/sutran/snapshot";
import { createSutranClient } from "@/integrations/sutran/sutran-client";

import { createCorridorRainService } from "./corridor-rain-service";
import { createRoadAlertsService } from "./road-alerts-service";

// Process-wide service instances used by route handlers. The in-memory cache lives
// for the lifetime of a server instance.
export const roadAlertsService = createRoadAlertsService({
  provider: createSutranClient({ baseUrl: env.SUTRAN_API_BASE }),
  snapshot: loadBundledAlertsSnapshot(),
});

let corridorPromise: Promise<CorridorData> | null = null;
/** The static PE-22 layer, read once from public/data (the same file the browser loads). */
function loadCorridor(): Promise<CorridorData> {
  corridorPromise ??= readFile(path.join(process.cwd(), "public", "data", "pe22.json"), "utf8").then((text) =>
    CorridorDataSchema.parse(JSON.parse(text)),
  );
  corridorPromise.catch(() => {
    corridorPromise = null; // retry on the next request instead of caching a failure
  });
  return corridorPromise;
}

export const corridorRainService = createCorridorRainService({
  provider: createOpenMeteoClient({ baseUrl: env.OPEN_METEO_BASE }),
  loadCorridor,
});
