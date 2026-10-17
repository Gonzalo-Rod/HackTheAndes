import { z } from "zod";
import { positionSchema } from "./road-geometry.ts";
const timestamp = z.iso.datetime({ offset: true });
export const historicalEventSchema = z
  .object({
    id: z.string().min(1),
    provider: z.enum(["provias", "coen"]),
    sourceIds: z.array(z.string().min(1)).min(1),
    sourceUrls: z.array(z.url()).min(1),
    date: z.iso.date(),
    occurrenceFromUtc: timestamp,
    occurrenceUntilUtc: timestamp,
    timePrecision: z.enum(["day", "conflicting_hours"]),
    timeCandidatesUtc: z.array(timestamp),
    position: positionSchema.nullable(),
    sourceKmStart: z.number().nonnegative().nullable(),
    sourceKmEnd: z.number().nonnegative().nullable(),
    hazardType: z.enum(["debris_flow", "rockfall_or_slope_failure", "landslide", "flood"]),
    rawType: z.string(),
    rawHazard: z.string(),
    trigger: z.enum(["unverified", "rainfall_reported"]),
    initialRoadStatus: z.string(),
    spatialMatch: z
      .object({
        state: z.enum(["within_500m", "outside_corridor", "needs_geocoding"]),
        distanceM: z.number().nonnegative().nullable(),
        segmentId: z.string().nullable(),
      })
      .strict(),
    labelStatus: z.literal("candidate_review_required"),
    notes: z.array(z.string()).min(1),
  })
  .strict()
  .superRefine((event, context) => {
    if (Date.parse(event.occurrenceFromUtc) >= Date.parse(event.occurrenceUntilUtc))
      context.addIssue({ code: "custom", message: "Invalid occurrence interval" });
    if (
      event.spatialMatch.state === "within_500m" &&
      (!event.position ||
        event.spatialMatch.distanceM === null ||
        event.spatialMatch.distanceM > 500 ||
        event.spatialMatch.segmentId === null)
    )
      context.addIssue({ code: "custom", message: "Unverified corridor association" });
    if (event.timePrecision === "day" && event.timeCandidatesUtc.length)
      context.addIssue({
        code: "custom",
        message: "Date-only records cannot have invented event hours",
      });
    if (event.timePrecision === "conflicting_hours" && event.timeCandidatesUtc.length < 2)
      context.addIssue({ code: "custom", message: "Conflicting times must remain explicit" });
  });
export const historicalEventsSchema = z
  .object({
    schemaVersion: z.literal(1),
    geometryRevision: z.string().regex(/^[a-f0-9]{64}$/),
    capturedAt: timestamp,
    sources: z
      .array(
        z
          .object({
            year: z.union([z.literal(2024), z.literal(2025)]),
            sourceUrl: z.url(),
            capturedAt: timestamp,
            sha256: z.string().regex(/^[a-f0-9]{64}$/),
            bytes: z.number().int().positive(),
          })
          .strict(),
      )
      .min(1),
    events: z.array(historicalEventSchema).min(1),
    exclusions: z.array(
      z
        .object({
          sourceId: z.string(),
          provider: z.literal("provias"),
          date: z.iso.date(),
          reason: z.literal("not_a_selected_natural_hazard"),
          rawType: z.string(),
          rawHazard: z.string(),
        })
        .strict(),
    ),
    diagnostics: z.array(
      z
        .object({ year: z.number().int(), exactPe22Records: z.number().int().nonnegative() })
        .strict(),
    ),
    negativeExamples: z.literal(0),
    coverage: z.literal("incomplete"),
    trainingReady: z.literal(false),
    limitations: z.array(z.string()).min(1),
  })
  .strict()
  .refine(
    (value) => new Set(value.events.map((event) => event.id)).size === value.events.length,
    "Duplicate historical identities",
  );
export type HistoricalEvents = z.infer<typeof historicalEventsSchema>;
