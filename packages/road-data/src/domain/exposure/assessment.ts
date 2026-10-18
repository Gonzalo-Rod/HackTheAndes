import type { ExposureInput } from "../../contracts/exposure-input.ts";
import type {
  ExposureAssessment,
  ExposurePolicy,
  ExposureWindow,
} from "../../contracts/exposure.ts";
import { summarizeOperationalWeather } from "../weather/aggregate.ts";
import { assessWindow, capByLocalSusceptibility, combineWindows, includePeak } from "./window.ts";

/** Pure calculation over captured inputs; time and content identities are supplied by the service. */
export function calculateExposure(
  input: ExposureInput,
  policy: ExposurePolicy,
  identities: {
    assessmentId: string;
    policySha256: string;
    assessedAt: string;
  },
): ExposureAssessment {
  const anchorMs = Math.floor(Date.parse(input.weather.capturedAt) / 3_600_000) * 3_600_000;
  const anchorAt = new Date(anchorMs).toISOString();
  const rain = new Map(
    summarizeOperationalWeather(input.weather, anchorMs).map((c) => [c.catchmentId, c]),
  );
  const susceptibility = new Map(input.susceptibility.map((s) => [s.catchmentId, s]));
  const missingRain = { ok: false as const, error: "unknown_catchment" as const };
  const catchments = input.catchments.map((catchment) => {
    const weather = rain.get(catchment.id);
    const geology = susceptibility.get(catchment.id);
    const coverageFraction = geology ? 1 - geology.unknownWeight : null;
    const highFraction = geology ? geology.classWeights["4"] + geology.classWeights["5"] : 0;
    const past72h = weather?.rainMm72hPast ?? missingRain;
    const past168h = weather?.rainMm168hPast ?? missingRain;
    const create = (
      horizonHours: 6 | 24 | 72,
      validFrom: string,
      rain: ExposureWindow["forecastRain"],
    ) =>
      assessWindow({
        validFrom,
        horizonHours,
        rain,
        coverageFraction,
        highFraction,
        past72h,
        past168h,
        policy,
      });
    const sixHourly = Array.from({ length: 12 }, (_, i) =>
      create(
        6,
        new Date(anchorMs + i * 6 * 3_600_000).toISOString(),
        weather?.sixHourForecasts[i]?.rain ?? missingRain,
      ),
    );
    return {
      catchmentId: catchment.id,
      segmentIds: catchment.segmentIds,
      associationConfidence: "low" as const,
      susceptibilityCoverageFraction: coverageFraction ?? 0,
      highSusceptibilityFraction: highFraction,
      antecedentRain72h: past72h,
      antecedentRain168h: past168h,
      windows: {
        next24h: includePeak(
          create(24, anchorAt, weather?.rainMm24hForecast ?? missingRain),
          sixHourly.slice(0, 4),
        ),
        next72h: includePeak(
          create(72, anchorAt, weather?.rainMm72hForecast ?? missingRain),
          sixHourly,
        ),
        sixHourly,
      },
    };
  });
  const localClasses = new Map(
    (input.segmentSusceptibility ?? []).map((s) => [s.segmentId, s.susceptibilityClasses]),
  );
  const segmentAssessments = input.segments.map((segment) => {
    const linked = catchments.filter((c) => c.segmentIds.includes(segment.segmentId));
    const local = localClasses.get(segment.segmentId);
    const aggregate = (horizon: 6 | 24 | 72, index?: number): ExposureWindow => {
      const from = new Date(anchorMs + (index ?? 0) * 6 * 3_600_000).toISOString();
      const sourceWindows = linked
        .map((c) =>
          horizon === 6
            ? c.windows.sixHourly[index ?? 0]
            : horizon === 24
              ? c.windows.next24h
              : c.windows.next72h,
        )
        .filter((w): w is ExposureWindow => w !== undefined);
      const combined = combineWindows(sourceWindows, {
        validFrom: from,
        validUntil: new Date(Date.parse(from) + horizon * 3_600_000).toISOString(),
        horizonHours: horizon,
        state: "unknown",
        category: null,
        forecastRain: missingRain,
        reasons: ["no_catchment_link"],
      });
      return policy.minimumLocalSusceptibilityClass === undefined
        ? combined
        : capByLocalSusceptibility(combined, local, policy.minimumLocalSusceptibilityClass);
    };
    return {
      segmentId: segment.segmentId,
      catchmentIds: linked.map((c) => c.catchmentId),
      distanceFromOriginStartKm: segment.distanceFromOriginStartKm,
      distanceFromOriginEndKm: segment.distanceFromOriginEndKm,
      kilometerCalibration: "unverified" as const,
      rainfallAggregation: "maximum_linked_catchment_total" as const,
      windows: {
        next24h: aggregate(24),
        next72h: aggregate(72),
        sixHourly: Array.from({ length: 12 }, (_, i) => aggregate(6, i)),
      },
    };
  });
  return {
    schemaVersion: 1,
    ...identities,
    geometryRevision: input.geometryRevision,
    anchorAt,
    interpretation: "estimated_climate_exposure_not_disruption_probability",
    automatedAlertUse: false,
    policy,
    sources: {
      weatherSha256: input.sourceHashes.weather,
      hazardsSha256: input.sourceHashes.hazards,
      catchmentsSha256: input.sourceHashes.catchments,
      segmentsSha256: input.sourceHashes.segments,
      weatherCapturedAt: input.weather.capturedAt,
      hazardsCapturedAt: input.hazardsCapturedAt,
      catchmentsPreparedAt: new Date(input.catchmentsPreparedAt).toISOString(),
      forecastIssuedAt: null,
      weatherModel: "ecmwf_ifs025",
      nominalGridResolutionKm: 25,
      susceptibilityPublishedAt: null,
      sourceUrls: [...new Set([...input.weather.sourceUrls, ...input.susceptibilitySourceUrls])],
    },
    catchments,
    segments: segmentAssessments,
    officialAdvisories: {
      source: "senamhi",
      capturedAt: input.hazardsCapturedAt,
      automatedAssessmentUse: false,
      contextEndpoint: "/api/hazards",
      note: "Official advisories remain separate context pending temporal eligibility",
    },
    limitations: [
      "Experimental engineering attention rules; no calibrated hazard probability or safe-route guarantee.",
      "Coarse HydroBASINS road associations include downstream terrain; regional susceptibility and sampled area fractions are approximate.",
      "Forecast rainfall is on a nominal 25 km grid; recent rain is model-estimated. Issue time is not supplied.",
      "Susceptibility publication time is unverified. Official advisories and incidents remain separate context.",
      "Segment rainfall is the maximum linked catchment total, not rainfall at the segment; unlinked segments remain unknown.",
    ],
  };
}
