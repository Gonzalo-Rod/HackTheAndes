import { catchmentSnapshotSchema } from "../contracts/road-catchments.ts";
import {
  weatherCaptureSchema,
  type WeatherCapture,
  type WeatherProvider,
  type WeatherQuery,
} from "../contracts/catchment-weather.ts";

export async function prepareCatchmentWeather({
  catchments: input,
  provider,
  query,
  requestId,
  now,
  samplePlan,
  snapDegrees,
}: {
  catchments: unknown;
  provider: WeatherProvider;
  query: WeatherQuery;
  requestId: string;
  now: Date;
  samplePlan?: WeatherCapture | undefined;
  /**
   * Rounds samples to the model grid before requesting, so each grid cell costs one location call.
   * With `cell_selection=nearest` the provider returns the same cell either way.
   */
  snapDegrees?: number | undefined;
}): Promise<WeatherCapture> {
  const catchments = catchmentSnapshotSchema.parse(input);
  const points: [number, number][] = [];
  const indexes = new Map<string, number>();
  const snap = (value: number) =>
    snapDegrees ? Number((Math.round(value / snapDegrees) * snapDegrees).toFixed(6)) : value;
  const requestKey = (sample: { longitude: number; latitude: number }) =>
    `${snap(sample.longitude)},${snap(sample.latitude)}`;
  for (const feature of catchments.features)
    for (const sample of feature.properties.samplePoints) {
      const key = requestKey(sample);
      if (!indexes.has(key)) {
        indexes.set(key, points.length);
        points.push([snap(sample.longitude), snap(sample.latitude)]);
      }
    }
  if (
    samplePlan &&
    (samplePlan.geometryRevision !== catchments.geometryRevision ||
      samplePlan.catchments.length !== catchments.features.length ||
      samplePlan.catchments.some((c) => !catchments.features.some((f) => f.id === c.catchmentId)))
  )
    throw new Error("Weather sample plan is incompatible with catchments");
  const requested = samplePlan ? samplePlan.grids.map((grid) => grid.position) : points;
  const response = await provider.fetchWeather(requested, query, requestId);
  if (response.series.length !== requested.length)
    throw new Error("Weather provider returned an incomplete batch");
  const grids = new Map<string, WeatherCapture["grids"][number]>();
  for (const series of response.series) {
    const existing = grids.get(series.id);
    if (existing && JSON.stringify(existing) !== JSON.stringify(series))
      throw new Error("Duplicate weather grid returned conflicting values");
    grids.set(series.id, series);
  }
  return weatherCaptureSchema.parse({
    schemaVersion: 1,
    geometryRevision: catchments.geometryRevision,
    capturedAt: now.toISOString(),
    kind: query.kind,
    model: query.kind === "reanalysis" ? "era5" : "ecmwf_ifs025",
    nominalGridResolutionKm: 25,
    forecastIssuedAt: null,
    issueTimeStatus: "not_supplied_by_endpoint",
    precipitationUnit: "mm",
    timeSemantics: "preceding_hour",
    sourceUrls: response.sourceUrls,
    grids: [...grids.values()],
    catchments: catchments.features.map((feature) => {
      const weights = new Map<string, number>();
      if (samplePlan) {
        const plan = samplePlan.catchments.find((c) => c.catchmentId === feature.id);
        if (!plan) throw new Error("Missing weather catchment plan");
        for (const item of plan.gridWeights) {
          const index = samplePlan.grids.findIndex((grid) => grid.id === item.gridId);
          const grid = response.series[index];
          if (!grid) throw new Error("Missing weather grid from reusable plan");
          weights.set(grid.id, (weights.get(grid.id) ?? 0) + item.weight);
        }
      } else
        for (const sample of feature.properties.samplePoints) {
          const index = indexes.get(requestKey(sample));
          if (index === undefined) throw new Error("Missing weather sample index");
          const grid = response.series[index];
          if (!grid) throw new Error("Missing weather sample grid");
          weights.set(grid.id, (weights.get(grid.id) ?? 0) + sample.weight);
        }
      const totalWeight = [...weights.values()].reduce((total, weight) => total + weight, 0);
      return {
        catchmentId: feature.id,
        gridWeights: [...weights].map(([gridId, weight]) => ({
          gridId,
          weight: Math.min(1, weight / totalWeight),
        })),
      };
    }),
    limitations: [
      "Coarse HydroBASINS fallback includes the downstream part of each crossing sub-basin.",
      "Approximately 25 km rainfall grid; small quebradas are unresolved.",
      "Past operational rainfall is a model estimate, not a station observation.",
      "Capture time is not model initialization or public issue time.",
      "Previous Runs offsets are per valid hour, not one coherent forecast available at a common decision time.",
      "Reanalysis is for reconstruction; it does not establish advance-warning skill.",
    ],
  });
}
