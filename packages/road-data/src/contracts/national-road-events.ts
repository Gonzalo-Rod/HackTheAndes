import { z } from "zod";
import { positionSchema } from "./road-geometry.ts";

// Display-only registry of every Provías emergency row nationwide. These records are not
// training labels, and absence from them never means a road had no emergency.
export const NATIONAL_EVENT_CATEGORIES = [
  "debris_flow",
  "rockfall_or_slope_failure",
  "landslide",
  "flood",
  "road_damage",
  "structure_damage",
  "social",
  "traffic",
  "other",
] as const;
export const NATIONAL_EVENT_STATUSES = [
  "interrumpido",
  "restringido",
  "normal",
  "desconocido",
] as const;

export const nationalRoadEventSchema = z
  .object({
    id: z.string().regex(/^provias:\d+$/),
    sourceYear: z.number().int().min(2000).max(2100),
    date: z.iso.date(),
    roadCode: z.string().min(1).max(32),
    department: z.string().max(80),
    province: z.string().max(80),
    district: z.string().max(80),
    kmStart: z.number().nonnegative().nullable(),
    kmEnd: z.number().nonnegative().nullable(),
    position: positionSchema.nullable(),
    category: z.enum(NATIONAL_EVENT_CATEGORIES),
    rawType: z.string().max(200),
    initialStatus: z.enum(NATIONAL_EVENT_STATUSES),
    rainfallReported: z.boolean(),
  })
  .strict();

const sourceSchema = z
  .object({
    year: z.number().int(),
    sourceUrl: z.url(),
    capturedAt: z.iso.datetime({ offset: true }),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    bytes: z.number().int().positive(),
  })
  .strict();

export const nationalRoadEventsSchema = z
  .object({
    schemaVersion: z.literal(1),
    capturedAt: z.iso.datetime({ offset: true }),
    sources: z.array(sourceSchema).min(1),
    events: z.array(nationalRoadEventSchema),
    diagnostics: z.array(
      z
        .object({
          year: z.number().int(),
          rows: z.number().int().nonnegative(),
          outsideWindow: z.number().int().nonnegative(),
          withoutPosition: z.number().int().nonnegative(),
        })
        .strict(),
    ),
    coverage: z.literal("incomplete"),
    limitations: z.array(z.string().min(1)).min(1),
  })
  .strict()
  .superRefine((registry, context) => {
    const years = new Set(registry.sources.map((source) => source.year));
    const ids = new Set<string>();
    for (const event of registry.events) {
      if (!years.has(event.sourceYear))
        context.addIssue({ code: "custom", message: `Event ${event.id} has no source capture` });
      if (ids.has(event.id))
        context.addIssue({ code: "custom", message: `Duplicate event ${event.id}` });
      ids.add(event.id);
    }
  });

export type NationalRoadEvent = z.infer<typeof nationalRoadEventSchema>;
export type NationalRoadEvents = z.infer<typeof nationalRoadEventsSchema>;
