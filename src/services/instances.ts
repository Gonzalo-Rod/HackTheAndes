import { env } from "@/config/env";
import { createOpenMeteoClient } from "@/integrations/open-meteo/open-meteo-client";
import { loadBundledAlertsSnapshot } from "@/integrations/sutran/snapshot";
import { createSutranClient } from "@/integrations/sutran/sutran-client";

import { loadDashboardCorridor } from "./platform/corridor";
import { createCorridorRainService } from "./corridor-rain-service";
import { createNationalRainService } from "./national-rain-service";
import nationalRainGrid from "@/integrations/local-data/national-rain-grid.json";
import { createRoadAlertsService } from "./road-alerts-service";

// Process-wide service instances used by route handlers. The in-memory cache lives
// for the lifetime of a server instance.
export const roadAlertsService = createRoadAlertsService({
  provider: createSutranClient({ baseUrl: env.SUTRAN_API_BASE }),
  snapshot: loadBundledAlertsSnapshot(),
});

export const corridorRainService = createCorridorRainService({
  provider: createOpenMeteoClient({ baseUrl: env.OPEN_METEO_BASE }),
  loadCorridor: loadDashboardCorridor,
});

export const nationalRainService = createNationalRainService({
  provider: createOpenMeteoClient({ baseUrl: env.OPEN_METEO_BASE }),
  grid: {
    stepDeg: nationalRainGrid.stepDeg,
    centers: nationalRainGrid.centers as [number, number][],
    displayStepDeg: nationalRainGrid.displayStepDeg,
    displayCenters: nationalRainGrid.displayCenters as [number, number][],
  },
});
