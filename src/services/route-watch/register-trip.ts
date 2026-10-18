import { z } from "zod";
import { estimatedArrival } from "@/domain/route-watch/prioritize";
import type { TripRepository } from "@/db/trips";
import { normalizePhone, phoneKey } from "@/integrations/security/contacts";
import { failure, readJson } from "@/services/platform/http";

// Route watch registration (F4): the company's transport monitor enters the stretch a truck will
// drive and the phone that should be called. The call consent is explicit and per trip.

/** Typical loaded-truck average on PE-22 mountain stretches; the monitor can override it. */
export const DEFAULT_TRUCK_SPEED_KMH = 35;
/** Trips registered too far ahead would watch stale conditions; too far back are already over. */
const MAX_DEPARTURE_AHEAD_MS = 7 * 24 * 60 * 60_000;
const MAX_DEPARTURE_BEHIND_MS = 12 * 60 * 60_000;
/** Shorter routes cannot be told apart from a single incident location. */
const MIN_ROUTE_LENGTH_KM = 1;

export const TripRegistrationSchema = z
  .object({
    phone: z.string().min(9).max(20),
    originKm: z.number().nonnegative(),
    destinationKm: z.number().nonnegative(),
    departAt: z.iso.datetime({ offset: true }).optional(),
    avgSpeedKmh: z.number().min(5).max(90).default(DEFAULT_TRUCK_SPEED_KMH),
    callConsent: z.literal(true),
  })
  .strict();

export function createTripRegistration(deps: {
  trips: Pick<TripRepository, "create" | "corridorBounds">;
  requireOrganization: (request: Request) => Promise<{ organizationId: string }>;
  pepper: string;
  revision: string;
  now: () => number;
}) {
  return async function register(request: Request): Promise<Response> {
    const { organizationId } = await deps.requireOrganization(request);
    const input = await readJson(request, TripRegistrationSchema);
    const destination = normalizePhone(input.phone);
    const key = destination ? phoneKey(destination, deps.pepper) : null;
    if (!destination || !key) failure(400, "invalid_phone", "Ingresa un celular peruano válido.");

    const nowMs = deps.now();
    const departAt = input.departAt ? new Date(input.departAt).toISOString() : new Date(nowMs).toISOString();
    const departMs = Date.parse(departAt);
    if (departMs > nowMs + MAX_DEPARTURE_AHEAD_MS || departMs < nowMs - MAX_DEPARTURE_BEHIND_MS)
      failure(400, "invalid_departure", "La salida debe estar entre 12 horas atrás y 7 días adelante.");
    if (Math.abs(input.destinationKm - input.originKm) < MIN_ROUTE_LENGTH_KM)
      failure(400, "invalid_route", "El origen y el destino deben estar separados al menos 1 km.");
    const bounds = await deps.trips.corridorBounds(deps.revision);
    for (const km of [input.originKm, input.destinationKm])
      if (km < bounds.startKm || km > bounds.endKm) failure(400, "outside_corridor", "La ruta debe estar dentro del eje PE-22 disponible.");

    const trip = { originKm: input.originKm, destinationKm: input.destinationKm, departAt, avgSpeedKmh: input.avgSpeedKmh };
    const created = await deps.trips.create({
      ...trip,
      phoneKey: key,
      destination,
      organizationId,
      now: new Date(nowMs).toISOString(),
    });
    return Response.json(
      {
        tripId: created.id,
        status: created.status,
        estimatedArrival: estimatedArrival({ ...trip, id: created.id, isTest: false }),
        distanceReference: "geometry_distance",
      },
      { status: 201 },
    );
  };
}
