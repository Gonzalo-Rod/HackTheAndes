import { z } from "zod";

// Contract for GET /api/weather/pe22: rain sampled along the Carretera Central.
// Rainfall is in millimetres per 24 h window; km follows the MTC geometry of the corridor.

export const RainSampleSchema = z.object({
  km: z.number(),
  lng: z.number(),
  lat: z.number(),
  elevationM: z.number(),
  /** Model-estimated rain for 24 complete hours ending at the capture hour (UTC). */
  pastMm: z.number().nonnegative(),
  /** Forecast rain for 24 complete hours after the capture hour (UTC). */
  nextMm: z.number().nonnegative(),
});

export const CorridorRainResponseSchema = z.object({
  samples: z.array(RainSampleSchema).min(1),
  /** When the server obtained the data from the weather provider (ISO, UTC). */
  fetchedAt: z.string(),
  source: z.literal("open-meteo"),
  /** True when the provider failed and the last good data is being served. */
  stale: z.boolean(),
});

export type RainSample = z.infer<typeof RainSampleSchema>;
export type CorridorRainResponse = z.infer<typeof CorridorRainResponseSchema>;
