import { z } from "zod";

// Contracts for /api/company/trips: route watches registered by a company's transport monitor.
const IsoDateTime = z.iso.datetime({ offset: true });

export const RouteWatchSchema = z.object({
  id: z.uuid(),
  originKm: z.number(),
  destinationKm: z.number(),
  departAt: IsoDateTime,
  avgSpeedKmh: z.number().positive(),
  /** Continuous route watch deadline; null for a single truck trip. */
  watchUntil: IsoDateTime.nullable(),
  status: z.enum(["planned", "active"]),
  callCount: z.number().int().nonnegative(),
  lastCallAt: IsoDateTime.nullable(),
});
export const RouteWatchListSchema = z.object({ watches: z.array(RouteWatchSchema) });
export const RouteWatchCreatedSchema = z.object({
  tripId: z.uuid(),
  status: z.enum(["planned", "active"]),
  mode: z.enum(["trip", "route"]),
  watchUntil: IsoDateTime.optional(),
  estimatedArrival: IsoDateTime.optional(),
});

/** Periods offered for a continuous watch; the server accepts any whole hour up to 7 days. */
export const ROUTE_WATCH_PERIOD_HOURS = [12, 24, 72, 168] as const;

export type RouteWatch = z.infer<typeof RouteWatchSchema>;
