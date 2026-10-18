import { readBundledNationalRoadEvents } from "@peruroad/road-data/road-history";
import { platformRoute } from "./http";

// A dated public export rather than a live feed, so there is no database read or fallback chain.
export const readNationalRoadHistory = platformRoute("history.road_events", async () => {
  const data = await readBundledNationalRoadEvents();
  return Response.json({
    data,
    meta: {
      state: "snapshot",
      servedAt: new Date().toISOString(),
      capturedAt: data.capturedAt,
      message: "Emergencias registradas por Provías Nacional (ene–abr 2024 y 2025). Cobertura incompleta; no son alertas vigentes.",
    },
  });
});
