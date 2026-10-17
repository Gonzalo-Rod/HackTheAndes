import { z } from "zod";
import type { JsonTransport } from "../http/json-transport.ts";
import {
  weatherGridSchema,
  type WeatherProvider,
  type WeatherVariable,
} from "../../contracts/catchment-weather.ts";

// Keep one named 0.25-degree model across operational data and fixed-lead archives.
const MODEL = "ecmwf_ifs025";
const BATCH_LOCATIONS = 20;
const locationSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  elevation: z.number().nullable(),
  utc_offset_seconds: z.literal(0),
  hourly_units: z.record(z.string(), z.string()),
  hourly: z
    .object({ time: z.array(z.number().int()) })
    .catchall(z.array(z.number().nonnegative().nullable())),
});
const responseSchema = z.union([
  z.array(locationSchema),
  locationSchema.transform((value) => [value]),
]);
export function createPrecipitationProvider(transport: JsonTransport): WeatherProvider {
  return {
    async fetchWeather(points, query, requestId) {
      if (!points.length) throw new Error("No weather sample points");
      const dated = query.kind !== "operational";
      if (
        dated &&
        (!z.iso.date().safeParse(query.startDate).success ||
          !z.iso.date().safeParse(query.endDate).success ||
          String(query.startDate) > String(query.endDate))
      )
        throw new Error("Invalid weather date range");
      const variables: WeatherVariable[] =
        query.kind === "previous_runs"
          ? [
              "precipitation_previous_day1",
              "precipitation_previous_day2",
              "precipitation_previous_day3",
              "precipitation_previous_day4",
            ]
          : ["precipitation"];
      const series = [];
      const sourceUrls = [];
      for (let offset = 0; offset < points.length; offset += BATCH_LOCATIONS) {
        const batch = points.slice(offset, offset + BATCH_LOCATIONS);
        const params = new URLSearchParams({
          latitude: batch.map((p) => p[1]).join(","),
          longitude: batch.map((p) => p[0]).join(","),
          hourly: variables.join(","),
          models: query.kind === "reanalysis" ? "era5" : MODEL,
          timeformat: "unixtime",
          timezone: "GMT",
          cell_selection: "nearest",
          elevation: batch.map(() => "nan").join(","),
        });
        if (dated) {
          params.set("start_date", String(query.startDate));
          params.set("end_date", String(query.endDate));
        } else {
          params.set("past_hours", "168");
          params.set("forecast_hours", "73");
        }
        const base =
          query.kind === "reanalysis"
            ? "https://archive-api.open-meteo.com/v1/archive"
            : query.kind === "previous_runs"
              ? "https://previous-runs-api.open-meteo.com/v1/forecast"
              : "https://api.open-meteo.com/v1/forecast";
        const url = `${base}?${params}`;
        const locations = responseSchema.parse(
          await transport.getJson(url, { provider: "open-meteo", requestId }),
        );
        if (locations.length !== batch.length) throw new Error("Weather point count mismatch");
        if (dated) {
          const start = Date.parse(`${query.startDate}T00:00:00Z`) / 1000;
          const end = Date.parse(`${query.endDate}T23:00:00Z`) / 1000;
          if (
            locations.some(
              (location) =>
                location.hourly.time[0] !== start ||
                location.hourly.time.at(-1) !== end ||
                location.hourly.time.length !== (end - start) / 3600 + 1,
            )
          )
            throw new Error("Weather dates do not match the requested range");
        }
        for (const location of locations) {
          if (
            location.hourly_units.time !== "unixtime" ||
            variables.some((variable) => location.hourly_units[variable] !== "mm")
          )
            throw new Error("Unexpected weather units");
          series.push(
            weatherGridSchema.parse({
              id: `${location.longitude},${location.latitude}`,
              position: [location.longitude, location.latitude],
              elevationM: location.elevation,
              timesUtc: location.hourly.time.map((time) => new Date(time * 1000).toISOString()),
              values: Object.fromEntries(
                variables.map((variable) => [variable, location.hourly[variable]]),
              ),
            }),
          );
        }
        sourceUrls.push(url);
      }
      return { sourceUrls, series };
    },
  };
}
