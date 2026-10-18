import { z } from "zod";
import { subscriptionRangeSchema } from "./notifications";
export const routeEndpointSchema = z
  .object({
    distanceKm: z.number().nonnegative(),
    label: z.string().trim().min(1).max(120),
    geometryRevision: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export const routeDraftSchema = z
  .object({
    id: z.uuid(),
    origin: routeEndpointSchema.nullable(),
    isTest: z.boolean(),
    expiresAt: z.iso.datetime(),
    proposal: z.object({ range: subscriptionRangeSchema, code: z.string().regex(/^[A-F0-9]{8}$/) }).optional(),
  })
  .strict();
export type RouteEndpoint = z.infer<typeof routeEndpointSchema>;
export type RouteDraft = z.infer<typeof routeDraftSchema>;
export type RouteAction =
  | { kind: "routeStart"; draft: RouteDraft }
  | { kind: "routeCancel" }
  | { kind: "routeActivate"; code: string }
  | { kind: "routeOrigin"; draftId: string; endpoint: RouteEndpoint }
  | { kind: "routeDestination"; draftId: string; origin: RouteEndpoint; range: import("./notifications").SubscriptionRange; code: string };
