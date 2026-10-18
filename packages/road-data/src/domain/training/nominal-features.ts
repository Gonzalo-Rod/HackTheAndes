import type { WeatherCapture, WeatherVariable } from "../../contracts/catchment-weather.ts";
import type { CatchmentSnapshot } from "../../contracts/road-catchments.ts";
import type { TerrainCapture } from "../../contracts/spatial-inputs.ts";
import { aggregateRain } from "../weather/aggregate.ts";
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
export function nominalFeatures(
  capture: WeatherCapture,
  terrain: TerrainCapture,
  catchments: CatchmentSnapshot,
  catchmentId: string,
  decisionAt: string,
  horizonHours: 6 | 24 | 72,
) {
  if (capture.kind !== "previous_runs")
    throw new Error("Historical predictors require the fixed-lead archive, not reanalysis");
  if (
    capture.geometryRevision !== terrain.geometryRevision ||
    capture.geometryRevision !== catchments.geometryRevision
  )
    throw new Error("Feature source geometry revisions differ");
  const decision = Date.parse(decisionAt);
  let forecastRainMm: number | null = 0;
  for (let hour = 1; hour <= horizonHours; hour++) {
    const valid = decision + hour * HOUR_MS;
    // Extra nominal day leaves a buffer; without actual availability evidence this still is NOT as-of verified.
    const offset = Math.ceil((valid - decision) / DAY_MS) + 1;
    const rain = aggregateRain(
      capture,
      catchmentId,
      `precipitation_previous_day${offset}` as WeatherVariable,
      valid - HOUR_MS,
      valid,
    );
    if (!rain.ok) {
      forecastRainMm = null;
      break;
    }
    forecastRainMm += rain.precipitationMm;
  }
  const past = (hours: number) => {
    const result = aggregateRain(
      capture,
      catchmentId,
      "precipitation_previous_day1",
      decision - hours * HOUR_MS,
      decision,
    );
    return result.ok ? result.precipitationMm : null;
  };
  const slope = terrain.catchments.find((c) => c.catchmentId === catchmentId);
  const catchment = catchments.features.find((c) => c.id === catchmentId);
  return {
    features: {
      forecastRainMm: forecastRainMm === null ? null : Math.round(forecastRainMm * 1000) / 1000,
      antecedentRainMm72h: past(72),
      antecedentRainMm168h: past(168),
      meanSlopeDegrees: slope?.estimatedMeanSlopeDegrees ?? null,
      catchmentAreaKm2: catchment?.properties.areaKm2 ?? null,
    },
    trainingEligible: false as const,
    blockers: [
      "forecast_public_availability_unverified",
      "antecedent_forecast_availability_unverified",
      "historical_static_feature_availability_unverified",
    ],
    provenance: {
      weatherModel: capture.model,
      forecastIssuedAt: null,
      selection: "nominal_fixed_lead_with_one_extra_day",
    },
  };
}
