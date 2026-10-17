import { createDataSnapshotRepository } from "@peruroad/road-data/model-inputs";
import { preparedHazardsSchema } from "@peruroad/road-data/model-inputs/spatial-contracts";
import { historicalEventsSchema } from "@peruroad/road-data/model-inputs/event-contracts";
import { weatherCaptureSchema } from "@peruroad/road-data/weather/contracts";
import { database } from "./pool";
import { loadGeometryRevision } from "@/config/env";
export function readHazards() {
  return createDataSnapshotRepository(database(), preparedHazardsSchema).read("hazards", loadGeometryRevision(), "current");
}
export function readHistoricalEvents() {
  return createDataSnapshotRepository(database(), historicalEventsSchema).read(
    "historical-events",
    loadGeometryRevision(),
    "2024-2025-candidates",
  );
}
export function readWeather(kind: "operational" | "previous_runs" | "reanalysis", file: string) {
  return createDataSnapshotRepository(database(), weatherCaptureSchema).read(`weather-${kind}`, loadGeometryRevision(), file);
}
