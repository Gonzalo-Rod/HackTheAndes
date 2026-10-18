import { z } from "zod";
import { nationalRoadEventsSchema } from "@peruroad/road-data/road-history/contracts";

export { NATIONAL_EVENT_CATEGORIES } from "@peruroad/road-data/road-history/contracts";
export type { NationalRoadEvent, NationalRoadEvents } from "@peruroad/road-data/road-history/contracts";

// Contract for GET /api/history/road-events: a dated, display-only Provías capture.
export const RoadHistoryMetaSchema = z.object({
  state: z.literal("snapshot"),
  servedAt: z.iso.datetime({ offset: true }),
  capturedAt: z.iso.datetime({ offset: true }),
  message: z.string(),
});
export const RoadHistoryResponseSchema = z.object({ data: nationalRoadEventsSchema, meta: RoadHistoryMetaSchema });
export type RoadHistoryResponse = z.infer<typeof RoadHistoryResponseSchema>;
