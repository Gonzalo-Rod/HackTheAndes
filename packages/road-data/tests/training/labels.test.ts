import { expect, it } from "vitest";
import { labelWindow, reviewAudit } from "../../src/domain/training/labels.ts";
import { assembleDataset } from "../../src/domain/training/dataset.ts";
import { asOfObservationSchema } from "../../src/contracts/logistic-training.ts";
import { labelRegistrySchema } from "../../src/contracts/training-labels.ts";
import { historicalEventSchema } from "../../src/contracts/historical-events.ts";
import { sources, observation, coverage } from "./support.ts";
const label = (input = observation(), monitored = sources.coverage) =>
  labelWindow(input, sources.events, sources.labels, monitored, sources.catchments);
it("allows documented minute precision for six-hour labels and rejects collapsing date-only uncertainty", () => {
  const event = sources.events.events.find((e) => e.id === "provias:19753");
  if (!event) throw new Error("Missing positive test fixture");
  expect(
    historicalEventSchema.safeParse({ ...event, occurrenceUntilUtc: "2024-02-21T06:00:00Z" })
      .success,
  ).toBe(false);
  const minute = historicalEventSchema.parse({
    ...event,
    timePrecision: "minute",
    occurrenceFromUtc: "2024-02-21T06:10:00Z",
    occurrenceUntilUtc: "2024-02-21T06:11:00Z",
    timeCandidatesUtc: ["2024-02-21T06:10:00Z"],
  });
  expect(
    labelWindow(
      observation(undefined, 6),
      { ...sources.events, events: [minute] },
      sources.labels,
      sources.coverage,
      sources.catchments,
    ),
  ).toMatchObject({ label: 1 });
});
it("reviews all eight candidates without converting mixed causes or missing events to negatives", () => {
  const audit = reviewAudit(sources.events, sources.labels, sources.catchments);
  expect(audit.counts).toMatchObject({
    positiveEvents: 6,
    unknownEvents: 2,
    mappedPositiveEvents: 2,
    excludedTrafficCrashes: 2,
  });
  expect(audit.records.find((r) => r.eventId === "provias:20934")?.decision).toBe("unknown");
  expect(sources.coverage.windows).toHaveLength(0);
});
it("uses entire occurrence intervals and preserves unknown six-hour labels", () => {
  expect(label()).toMatchObject({ label: 1, evidenceIds: ["provias:19753"] });
  expect(label(observation(undefined, 6))).toMatchObject({
    label: null,
    reason: "unresolved_or_partially_overlapping_event",
  });
  expect(label(observation("2024-02-21T06:00:00Z", 24))).toMatchObject({ label: null });
});
it("requires verified complete coverage for a negative window", () => {
  const input = observation("2024-04-10T05:00:00Z");
  expect(label(input)).toMatchObject({ label: null, reason: "no_verified_non_event_coverage" });
  expect(label(input, coverage())).toMatchObject({
    label: 0,
    evidenceIds: ["synthetic-monitoring"],
  });
  expect(label(input, coverage("2024-04-10T06:00:00Z"))).toMatchObject({ label: null });
});
it("never uses a coverage claim to erase uncertain onset or unlocated events", () => {
  expect(
    label(observation(undefined, 6), coverage("2024-02-01T00:00:00Z", "2024-03-01T00:00:00Z")),
  ).toMatchObject({ label: null });
  const result = label(
    observation("2025-02-22T05:00:00Z"),
    coverage("2025-02-01T00:00:00Z", "2025-03-01T00:00:00Z"),
  );
  expect(result).toMatchObject({
    label: null,
    reason: "unresolved_or_partially_overlapping_event",
  });
});
it("rejects unsupported positive decisions, missing reviews and duplicate absolute decision times", () => {
  expect(
    labelRegistrySchema.safeParse({
      ...sources.labels,
      reviews: sources.labels.reviews.map((r) => ({
        ...r,
        decision: "positive_event",
        rainfallCause: "unverified",
      })),
    }).success,
  ).toBe(false);
  expect(() =>
    reviewAudit(sources.events, { ...sources.labels, reviews: [] }, sources.catchments),
  ).toThrow("Every candidate");
  const first = observation();
  expect(() =>
    assembleDataset({
      ...sources,
      observations: {
        ...sources.observations,
        observations: [first, { ...first, id: "another", decisionAt: "2024-02-21T00:00:00-05:00" }],
      },
    }),
  ).toThrow("Duplicate decision");
});
it("computes training labels from source evidence and excludes unknown observations", () => {
  const positive = observation(),
    unknown = observation("2024-04-10T05:00:00Z");
  const result = assembleDataset({
    ...sources,
    observations: { ...sources.observations, observations: [positive, unknown] },
  });
  expect(result.dataset.rows).toHaveLength(1);
  expect(result.dataset.rows[0]?.label).toBe(1);
  expect(result.excluded).toEqual([{ id: unknown.id, reason: "no_verified_non_event_coverage" }]);
});
it("rejects future availability, reanalysis predictors and incomplete provenance", () => {
  const input = observation();
  for (const changed of [
    {
      ...input,
      sources: input.sources.map((s) => ({ ...s, availableAt: "2026-10-18T00:00:00Z" })),
    },
    { ...input, sources: input.sources.map((s) => ({ ...s, kind: "reanalysis" })) },
    { ...input, sources: input.sources.slice(1) },
    { ...input, decisionAt: "2024-02-21T05:01:00Z" },
  ])
    expect(asOfObservationSchema.safeParse(changed).success).toBe(false);
});
