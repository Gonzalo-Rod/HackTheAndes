import { z } from "zod";
import { exposureAssessmentSchema } from "./exposure.ts";
export const exposureViewSchema = z
  .object({
    data: exposureAssessmentSchema,
    meta: z
      .object({
        state: z.enum(["ready", "stale", "unavailable"]),
        storage: z.enum(["database", "snapshot"]),
        servedAt: z.iso.datetime(),
        ageSeconds: z.number().nonnegative(),
        selectedHorizonHours: z.union([z.literal(24), z.literal(72)]),
        operationallyUsable: z.boolean(),
        automatedAlertUse: z.literal(false),
        message: z.string().min(1),
      })
      .strict(),
  })
  .strict();
export type ExposureView = z.infer<typeof exposureViewSchema>;
