import { z } from "zod";
export const UsageEventSchema = z
  .object({
    provider: z.string().min(1).max(64),
    eventId: z.string().min(1).max(256),
    phoneKey: z.string().regex(/^[a-f0-9]{64}$/),
    kind: z.literal("query_answered"),
    occurredAt: z.iso.datetime({ offset: true }),
    isTeam: z.boolean(),
    isTest: z.boolean(),
    isAutomated: z.boolean(),
  })
  .strict();
export type UsageEvent = z.infer<typeof UsageEventSchema>;
