import type { HistoricalEvents } from "../../contracts/historical-events.ts";
import type { CatchmentSnapshot } from "../../contracts/road-catchments.ts";
import type { LabelRegistry, CoverageRegistry } from "../../contracts/training-labels.ts";
import type { AsOfObservation } from "../../contracts/logistic-training.ts";
const HOUR_MS = 3_600_000;
type WindowLabel =
  { label: 0 | 1; episodeId: string; evidenceIds: string[] } | { label: null; reason: string };

export function assertReviewCoverage(
  events: HistoricalEvents,
  labels: LabelRegistry,
  catchments: CatchmentSnapshot,
) {
  if (
    events.geometryRevision !== labels.geometryRevision ||
    catchments.geometryRevision !== labels.geometryRevision
  )
    throw new Error("Label review geometry revisions differ");
  if (
    labels.reviews.length !== events.events.length ||
    labels.reviews.some((r) => !events.events.some((e) => e.id === r.eventId))
  )
    throw new Error("Every candidate requires exactly one review");
}
export function reviewAudit(
  events: HistoricalEvents,
  labels: LabelRegistry,
  catchments: CatchmentSnapshot,
) {
  assertReviewCoverage(events, labels, catchments);
  const records = events.events.map((event) => {
    const review = labels.reviews.find((r) => r.eventId === event.id);
    if (!review) throw new Error("Missing candidate review");
    const linkedCatchments = catchments.features
      .filter((c) => c.properties.segmentIds.includes(event.spatialMatch.segmentId ?? ""))
      .map((c) => c.id);
    return {
      eventId: event.id,
      decision: review.decision,
      episodeId: review.episodeId,
      date: event.date,
      linkedCatchments,
      supportedHorizonsHours: [6, 24, 72].filter(
        (h) =>
          h * HOUR_MS >= Date.parse(event.occurrenceUntilUtc) - Date.parse(event.occurrenceFromUtc),
      ),
      spatialBasis: linkedCatchments.length ? "approximate_road_segment_association" : "unmapped",
      unresolved: review.unresolved,
    };
  });
  return {
    schemaVersion: 1,
    target: labels.target,
    geometryRevision: labels.geometryRevision,
    reviewedAt: labels.reviewedAt,
    counts: {
      candidates: records.length,
      positiveEvents: records.filter((r) => r.decision === "positive_event").length,
      unknownEvents: records.filter((r) => r.decision === "unknown").length,
      mappedPositiveEvents: records.filter(
        (r) => r.decision === "positive_event" && r.linkedCatchments.length > 0,
      ).length,
      positiveEpisodes: new Set(
        records.filter((r) => r.decision === "positive_event").map((r) => r.episodeId),
      ).size,
      mappedPositiveEpisodes: new Set(
        records
          .filter((r) => r.decision === "positive_event" && r.linkedCatchments.length > 0)
          .map((r) => r.episodeId),
      ).size,
      excludedTrafficCrashes: events.exclusions.length,
    },
    records,
    limitations: [
      "Road-segment associations use the documented 500 m projection rule and coarse catchment links; they do not verify the causal watershed.",
      "A supported horizon contains the uncertainty interval; it does not identify an exact event hour.",
      "Positive event evidence alone does not establish training readiness.",
    ],
  };
}

export function labelWindow(
  observation: Pick<AsOfObservation, "catchmentId" | "decisionAt" | "horizonHours">,
  events: HistoricalEvents,
  labels: LabelRegistry,
  coverage: CoverageRegistry,
  catchments: CatchmentSnapshot,
): WindowLabel {
  const catchment = catchments.features.find((c) => c.id === observation.catchmentId);
  if (!catchment) return { label: null, reason: "unknown_catchment" };
  const start = Date.parse(observation.decisionAt),
    end = start + observation.horizonHours * HOUR_MS;
  const overlapping = events.events.filter(
    (event) =>
      (event.spatialMatch.segmentId === null ||
        catchment.properties.segmentIds.includes(event.spatialMatch.segmentId)) &&
      Date.parse(event.occurrenceFromUtc) < end &&
      Date.parse(event.occurrenceUntilUtc) > start,
  );
  const positives = overlapping.filter(
    (event) =>
      labels.reviews.some((r) => r.eventId === event.id && r.decision === "positive_event") &&
      event.spatialMatch.segmentId !== null &&
      Date.parse(event.occurrenceFromUtc) >= start &&
      Date.parse(event.occurrenceUntilUtc) <= end,
  );
  if (positives.length) {
    const episodes = labels.reviews
      .filter((r) => positives.some((e) => e.id === r.eventId))
      .map((r) => r.episodeId);
    return {
      label: 1,
      episodeId: [...new Set(episodes)].sort().join("|"),
      evidenceIds: positives.map((e) => e.id).sort(),
    };
  }
  if (overlapping.length)
    return { label: null, reason: "unresolved_or_partially_overlapping_event" };
  const monitored = coverage.windows.filter(
    (w) =>
      w.catchmentId === observation.catchmentId &&
      Date.parse(w.fromUtc) <= start &&
      Date.parse(w.untilUtc) >= end,
  );
  if (monitored.length > 1) return { label: null, reason: "ambiguous_monitoring_episode" };
  const window = monitored[0];
  return window
    ? { label: 0, episodeId: window.episodeId, evidenceIds: [window.id] }
    : { label: null, reason: "no_verified_non_event_coverage" };
}
