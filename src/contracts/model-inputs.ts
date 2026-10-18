import { z } from "zod";
import { preparedHazardsSchema, warningFeatureSchema } from "@peruroad/road-data/model-inputs/spatial-contracts";
import { catchmentWeatherViewSchema } from "@peruroad/road-data/weather/contracts";
export const DataInputMetaSchema = z.object({
  state: z.enum(["database", "snapshot"]),
  servedAt: z.iso.datetime(),
  capturedAt: z.iso.datetime({ offset: true }),
  ageSeconds: z.number().nonnegative(),
  stale: z.boolean(),
  message: z.string(),
});
export const HazardLayerSchema = z.object({ data: preparedHazardsSchema, meta: DataInputMetaSchema });
export const CatchmentWeatherLayerSchema = z.object({ data: catchmentWeatherViewSchema, meta: DataInputMetaSchema });
export type HazardLayer = z.infer<typeof HazardLayerSchema>;
export type CatchmentWeatherLayer = z.infer<typeof CatchmentWeatherLayerSchema>;

/** GET /api/hazards/warnings: unclipped SENAMHI warnings for all of Peru. */
export const NationalWarningsSchema = z.object({
  data: z.object({ type: z.literal("FeatureCollection"), features: z.array(warningFeatureSchema) }),
  meta: z.object({ state: z.enum(["live", "cache", "snapshot"]), capturedAt: z.iso.datetime(), message: z.string() }),
});
export type NationalWarnings = z.infer<typeof NationalWarningsSchema>;
