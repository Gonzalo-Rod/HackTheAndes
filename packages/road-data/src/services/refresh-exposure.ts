import type { WeatherProvider } from "../contracts/catchment-weather.ts";
import { weatherCaptureSchema } from "../contracts/catchment-weather.ts";
import { exposureInputSchema } from "../contracts/exposure-input.ts";
import {
  validateExposureRecord,
  exposureHash,
  exposureIdentity,
} from "../domain/exposure/record.ts";
import { calculateExposure } from "../domain/exposure/assessment.ts";
/** Reuse the reviewed spatial/grid plan; refresh weather without rewriting historical batches. */
export async function refreshExposureWeather(
  raw: unknown,
  provider: WeatherProvider,
  requestId: string,
  now: () => Date,
) {
  const previous = validateExposureRecord(raw);
  const old = previous.input.weather;
  const response = await provider.fetchWeather(
    old.grids.map((g) => g.position),
    { kind: "operational" },
    requestId,
  );
  if (
    response.series.length !== old.grids.length ||
    response.series.some((g, i) => g.id !== old.grids[i]?.id)
  )
    throw new Error("Weather grid plan changed");
  const capturedAt = now().toISOString();
  const weather = weatherCaptureSchema.parse({
    ...old,
    capturedAt,
    grids: response.series,
    sourceUrls: response.sourceUrls,
  });
  const input = exposureInputSchema.parse({
    ...previous.input,
    weather,
    sourceHashes: { ...previous.input.sourceHashes, weather: exposureHash(weather) },
  });
  const policy = previous.assessment.policy;
  return validateExposureRecord({
    input,
    assessment: calculateExposure(input, policy, {
      assessmentId: exposureIdentity(input, policy),
      policySha256: exposureHash(policy),
      assessedAt: capturedAt,
    }),
  });
}
