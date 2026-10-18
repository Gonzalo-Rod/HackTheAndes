import { z } from "zod";
import { subscriptionRangeSchema } from "./notifications";
export const routeEndpointSchema = z
  .object({
    distanceKm: z.number().nonnegative(),
    label: z.string().trim().min(1).max(120),
    geometryRevision: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
/** The road a route follows; endpoints and bounds come from its geometry revision. */
export const routeRoadSchema = z
  .object({
    roadCode: z.string().regex(/^PE-\d{1,3}[A-ZÑ]{0,3}$/u),
    geometryRevision: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export const routeDraftSchema = z
  .object({
    id: z.uuid(),
    /** Null until the user sends a road code (or a pin that identifies one); absent on older drafts. */
    road: routeRoadSchema.nullable().optional(),
    origin: routeEndpointSchema.nullable(),
    isTest: z.boolean(),
    expiresAt: z.iso.datetime(),
    proposal: z.object({ range: subscriptionRangeSchema, code: z.string().regex(/^[A-F0-9]{8}$/) }).optional(),
  })
  .strict();
export type RouteEndpoint = z.infer<typeof routeEndpointSchema>;
export type RouteRoad = z.infer<typeof routeRoadSchema>;
export type RouteDraft = z.infer<typeof routeDraftSchema>;
/** `prompt` is the next question, composed by the flow so storage stays free of road wording. */
export type RouteAction =
  | { kind: "routeStart"; draft: RouteDraft; prompt?: string }
  | { kind: "routeCancel" }
  | { kind: "routeActivate"; code: string }
  | { kind: "routeRoad"; draftId: string; road: RouteRoad; prompt: string }
  | { kind: "routeOrigin"; draftId: string; endpoint: RouteEndpoint; road?: RouteRoad; prompt?: string }
  | { kind: "routeDestination"; draftId: string; origin: RouteEndpoint; range: import("./notifications").SubscriptionRange; code: string };
