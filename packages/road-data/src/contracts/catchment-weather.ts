import { z } from "zod";
import { positionSchema } from "./road-geometry.ts";

export const weatherKindSchema = z.enum(["operational", "previous_runs", "reanalysis"]);
export const WEATHER_VARIABLES = [
  "precipitation",
  "precipitation_previous_day1",
  "precipitation_previous_day2",
  "precipitation_previous_day3",
  "precipitation_previous_day4",
] as const;
export type WeatherVariable = (typeof WEATHER_VARIABLES)[number];
const variableSchema = z.enum(WEATHER_VARIABLES);
export const weatherGridSchema = z
  .object({
    id: z.string().min(1),
    position: positionSchema,
    elevationM: z.number().nullable(),
    timesUtc: z
      .array(z.iso.datetime())
      .min(1)
      .max(24 * 366),
    values: z
      .partialRecord(variableSchema, z.array(z.number().nonnegative().nullable()))
      .refine((v) => Object.keys(v).length > 0),
  })
  .strict()
  .superRefine((grid, context) => {
    const times = grid.timesUtc.map(Date.parse);
    if (
      times.some(
        (time, i) =>
          time % 3_600_000 !== 0 || (i > 0 && time - (times[i - 1] ?? Number.NaN) !== 3_600_000),
      )
    )
      context.addIssue({
        code: "custom",
        message: "Weather hours must be consecutive UTC hour-end timestamps",
      });
    for (const values of Object.values(grid.values))
      if (values && values.length !== times.length)
        context.addIssue({ code: "custom", message: "Weather value/time length mismatch" });
  });
export const weatherCaptureSchema = z
  .object({
    schemaVersion: z.literal(1),
    geometryRevision: z.string().regex(/^[a-f0-9]{64}$/),
    capturedAt: z.iso.datetime(),
    kind: weatherKindSchema,
    model: z.enum(["ecmwf_ifs025", "era5"]),
    nominalGridResolutionKm: z.literal(25),
    forecastIssuedAt: z.null(),
    issueTimeStatus: z.literal("not_supplied_by_endpoint"),
    precipitationUnit: z.literal("mm"),
    timeSemantics: z.literal("preceding_hour"),
    sourceUrls: z.array(z.url()).min(1),
    grids: z.array(weatherGridSchema).min(1),
    catchments: z
      .array(
        z
          .object({
            catchmentId: z.string().min(1),
            gridWeights: z
              .array(
                z
                  .object({ gridId: z.string().min(1), weight: z.number().positive().max(1) })
                  .strict(),
              )
              .min(1),
          })
          .strict(),
      )
      .min(1),
    limitations: z.array(z.string()).min(1),
  })
  .strict()
  .superRefine((capture, context) => {
    const ids = new Set(capture.grids.map((grid) => grid.id));
    if (
      ids.size !== capture.grids.length ||
      new Set(capture.catchments.map((c) => c.catchmentId)).size !== capture.catchments.length
    )
      context.addIssue({ code: "custom", message: "Duplicate weather grid or catchment identity" });
    for (const catchment of capture.catchments) {
      const weights = catchment.gridWeights;
      if (
        new Set(weights.map((w) => w.gridId)).size !== weights.length ||
        weights.some((w) => !ids.has(w.gridId)) ||
        Math.abs(weights.reduce((n, w) => n + w.weight, 0) - 1) > 1e-8
      )
        context.addIssue({ code: "custom", message: "Invalid catchment weather weights" });
    }
    const expected: readonly WeatherVariable[] =
      capture.kind === "previous_runs" ? WEATHER_VARIABLES.slice(1) : ["precipitation"];
    if (
      capture.grids.some(
        (grid) =>
          expected.some((variable) => !grid.values[variable]) ||
          Object.keys(grid.values).length !== expected.length,
      )
    )
      context.addIssue({ code: "custom", message: "Weather variables disagree with product kind" });
    if ((capture.kind === "reanalysis") !== (capture.model === "era5"))
      context.addIssue({
        code: "custom",
        message: "Reanalysis and forecast models must remain distinct",
      });
  });
export type WeatherCapture = z.infer<typeof weatherCaptureSchema>;
export type WeatherGrid = z.infer<typeof weatherGridSchema>;
export type WeatherKind = z.infer<typeof weatherKindSchema>;
export interface WeatherQuery {
  kind: WeatherKind;
  startDate?: string | undefined;
  endDate?: string | undefined;
}
export interface WeatherProvider {
  fetchWeather(
    points: readonly [number, number][],
    query: WeatherQuery,
    requestId: string,
  ): Promise<{ sourceUrls: string[]; series: WeatherGrid[] }>;
}

export const rainAggregateSchema = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    precipitationMm: z.number().nonnegative(),
    hours: z.number().int().positive(),
  }),
  z.object({
    ok: z.literal(false),
    error: z.enum(["missing_hours", "unknown_catchment", "invalid_window"]),
  }),
]);
export const catchmentWeatherViewSchema = z.object({
  schemaVersion: z.literal(1),
  geometryRevision: z.string(),
  capturedAt: z.iso.datetime(),
  model: z.literal("ecmwf_ifs025"),
  nominalGridResolutionKm: z.literal(25),
  forecastIssuedAt: z.null(),
  anchorAt: z.iso.datetime(),
  grids: z.array(z.object({ id: z.string(), position: positionSchema })),
  catchments: z.array(
    z.object({
      catchmentId: z.string(),
      rainMm72hPast: rainAggregateSchema,
      rainMm168hPast: rainAggregateSchema,
      rainMm24hForecast: rainAggregateSchema,
      rainMm72hForecast: rainAggregateSchema,
      sixHourForecasts: z
        .array(
          z.object({
            validFrom: z.iso.datetime(),
            validUntil: z.iso.datetime(),
            rain: rainAggregateSchema,
          }),
        )
        .length(12),
    }),
  ),
  limitations: z.array(z.string()),
});
export type CatchmentWeatherView = z.infer<typeof catchmentWeatherViewSchema>;
