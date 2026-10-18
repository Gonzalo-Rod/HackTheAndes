import { z } from "zod";
const timestamp = z.iso.datetime({ offset: true });
export const geometryRevisionSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const evidenceSchema = z
  .object({
    sourceUrl: z.url(),
    sourceSha256: geometryRevisionSchema.nullable(),
    locator: z.string().min(1),
    finding: z.string().min(1),
  })
  .strict();
export const labelReviewSchema = z
  .object({
    eventId: z.string().min(1),
    episodeId: z.string().min(1),
    rainfallCause: z.enum(["documented", "unverified"]),
    roadDisruption: z.enum(["documented", "unverified"]),
    decision: z.enum(["positive_event", "unknown"]),
    evidence: z.array(evidenceSchema).min(1),
    unresolved: z.array(z.string().min(1)),
  })
  .strict()
  .refine(
    (v) =>
      v.decision !== "positive_event" ||
      (v.rainfallCause === "documented" && v.roadDisruption === "documented"),
    "Positive events require documented rainfall causation and road impact",
  );
export const labelRegistrySchema = z
  .object({
    schemaVersion: z.literal(1),
    target: z.literal("rainfall_related_road_disruption_onset"),
    geometryRevision: geometryRevisionSchema,
    candidateRegistrySha256: geometryRevisionSchema,
    reviewedAt: timestamp,
    reviews: z.array(labelReviewSchema).min(1),
  })
  .strict()
  .refine(
    (v) => new Set(v.reviews.map((r) => r.eventId)).size === v.reviews.length,
    "Duplicate event review",
  );
export const coverageRegistrySchema = z
  .object({
    schemaVersion: z.literal(1),
    geometryRevision: geometryRevisionSchema,
    windows: z.array(
      z
        .object({
          id: z.string().min(1),
          episodeId: z.string().min(1),
          catchmentId: z.string().min(1),
          fromUtc: timestamp,
          untilUtc: timestamp,
          scope: z.literal("all_linked_road_segments"),
          statement: z.literal("continuous_monitoring_no_target_disruption"),
          evidence: z.array(evidenceSchema).min(1),
          reviewedAt: timestamp,
        })
        .strict()
        .refine(
          (v) => Date.parse(v.fromUtc) < Date.parse(v.untilUtc),
          "Invalid monitoring interval",
        ),
    ),
  })
  .strict()
  .refine(
    (v) => new Set(v.windows.map((w) => w.id)).size === v.windows.length,
    "Duplicate monitoring window",
  );
export type LabelRegistry = z.infer<typeof labelRegistrySchema>;
export type CoverageRegistry = z.infer<typeof coverageRegistrySchema>;
