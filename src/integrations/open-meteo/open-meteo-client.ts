import { z } from "zod";

import { getJson, UpstreamError, type RequestOptions } from "@/integrations/http/fetch-json";

// Adapter for the Open-Meteo forecast API (free tier, non-commercial, CC BY 4.0).
// The rest of the app depends on RainProvider, not on this provider.

const PROVIDER = "open-meteo";

export interface RainPoint {
  lat: number;
  lng: number;
}

export interface HourlyRain {
  /** Unix seconds, one entry per hour, 24 h in the past through 24 h ahead. */
  timesSec: number[];
  /** Millimetres per hour; null where the model has no value. */
  precipitation: (number | null)[];
}

export interface RainProvider {
  /** One entry per requested point, in the same order. */
  fetchHourlyRain(points: readonly RainPoint[], requestId?: string): Promise<HourlyRain[]>;
}

const LocationSchema = z.object({
  hourly: z.object({ time: z.array(z.number().int()), precipitation: z.array(z.number().nonnegative().nullable()) }),
});
const ResponseSchema = z.union([z.array(LocationSchema), LocationSchema.transform((one) => [one])]);

export function createOpenMeteoClient(config: { baseUrl: string; fetchImpl?: RequestOptions["fetchImpl"] }): RainProvider {
  return {
    async fetchHourlyRain(points, requestId) {
      const params = new URLSearchParams({
        latitude: points.map((p) => p.lat.toFixed(4)).join(","),
        longitude: points.map((p) => p.lng.toFixed(4)).join(","),
        hourly: "precipitation",
        past_hours: "24",
        // Include the current hour and all 24 future hour-end precipitation values.
        forecast_hours: "25",
        timeformat: "unixtime",
        timezone: "GMT",
      });
      const body = await getJson(`${config.baseUrl}/forecast?${params.toString()}`, {
        provider: PROVIDER,
        operation: "weather.forecast",
        requestId,
        fetchImpl: config.fetchImpl,
      });
      const parsed = ResponseSchema.safeParse(body);
      if (!parsed.success || parsed.data.length !== points.length) {
        throw new UpstreamError("Respuesta con formato inválido", "invalid_body", PROVIDER);
      }
      return parsed.data.map((location) => ({ timesSec: location.hourly.time, precipitation: location.hourly.precipitation }));
    },
  };
}
