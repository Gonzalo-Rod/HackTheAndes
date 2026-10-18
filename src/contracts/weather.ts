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

// Contract for GET /api/weather/national: model rain on a coarse grid over all of Peru.
export const NationalRainCellSchema = z.object({
  lng: z.number(),
  lat: z.number(),
  pastMm: z.number().nonnegative(),
  nextMm: z.number().nonnegative(),
});
export const NationalRainResponseSchema = z.object({
  cells: z.array(NationalRainCellSchema),
  /** Cell edge in degrees; values are model estimates at the cell center, not area averages. */
  stepDeg: z.number().positive(),
  /** Finer cells interpolated from `cells` for display only; not additional model output. */
  display: z.object({ stepDeg: z.number().positive(), cells: z.array(NationalRainCellSchema) }),
  /** Grid cells without complete hourly data are omitted, never shown as dry. */
  missingCells: z.number().int().nonnegative(),
  fetchedAt: z.string(),
  source: z.literal("open-meteo"),
  stale: z.boolean(),
});
export type NationalRainResponse = z.infer<typeof NationalRainResponseSchema>;
