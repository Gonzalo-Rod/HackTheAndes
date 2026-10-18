import { z } from "zod";

export const ForecastRoadSchema = z
  .object({
    roadCode: z.string().regex(/^PE-\d{1,3}[A-ZÑ]{0,3}$/u),
    name: z.string(),
    geometryRevision: z.string().regex(/^[a-f0-9]{64}$/),
    measuredLengthKm: z.number().positive(),
    pilot: z.boolean(),
  })
  .strict();
export type ForecastRoad = z.infer<typeof ForecastRoadSchema>;

export const ForecastRoadsResponseSchema = z.object({ roads: z.array(ForecastRoadSchema) }).strict();
export type ForecastRoadsResponse = z.infer<typeof ForecastRoadsResponseSchema>;
