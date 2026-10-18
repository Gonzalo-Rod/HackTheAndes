import { readTrainingSources } from "../../src/integrations/training/files.ts";
import { FEATURE_NAMES, type AsOfObservation } from "../../src/contracts/logistic-training.ts";
export const sources = await readTrainingSources();
const feature = sources.catchments.features.find((c) =>
  c.properties.segmentIds.some((id) => id.endsWith(":00056")),
);
if (!feature) throw new Error("Missing linked catchment fixture");
export const catchmentId = feature.id;
export function observation(
  decisionAt = "2024-02-21T05:00:00Z",
  horizonHours: 6 | 24 | 72 = 24,
): AsOfObservation {
  const kinds = {
    forecastRainMm: "archived_forecast",
    antecedentRainMm72h: "forecast_based_antecedent",
    antecedentRainMm168h: "forecast_based_antecedent",
    meanSlopeDegrees: "dem",
    catchmentAreaKm2: "static_geometry",
  } as const;
  return {
    id: `test:${decisionAt}:${horizonHours}`,
    catchmentId,
    decisionAt,
    horizonHours,
    features: {
      forecastRainMm: 20,
      antecedentRainMm72h: 30,
      antecedentRainMm168h: 50,
      meanSlopeDegrees: 20,
      catchmentAreaKm2: 100,
    },
    sources: FEATURE_NAMES.map((name) => ({
      featureNames: [name],
      kind: kinds[name],
      availableAt: "2023-12-01T00:00:00Z",
      evidence: {
        sourceUrl: "https://example.test/synthetic-availability",
        sourceSha256: "e".repeat(64),
        locator: "Synthetic test fixture only",
        finding: "Synthetic data, never a verified historical availability claim",
      },
    })),
  };
}
export function coverage(fromUtc = "2024-04-01T05:00:00Z", untilUtc = "2024-05-01T05:00:00Z") {
  return {
    ...sources.coverage,
    windows: [
      {
        id: "synthetic-monitoring",
        episodeId: "synthetic-monitoring-episode",
        catchmentId,
        fromUtc,
        untilUtc,
        scope: "all_linked_road_segments" as const,
        statement: "continuous_monitoring_no_target_disruption" as const,
        evidence: [
          {
            sourceUrl: "https://example.test/synthetic-monitoring",
            sourceSha256: "d".repeat(64),
            locator: "Synthetic",
            finding: "Synthetic complete-monitoring fixture only",
          },
        ],
        reviewedAt: "2026-10-18T00:00:00Z",
      },
    ],
  };
}
