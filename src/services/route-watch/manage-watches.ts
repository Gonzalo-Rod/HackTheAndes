import { z } from "zod";
import type { TripRepository } from "@/db/trips";
import { failure } from "@/services/platform/http";

// The company dashboard lists its organization's active watches and can stop one. Phones are never
// returned; every query is scoped to the session's organization.

export function createWatchManagement(deps: {
  trips: Pick<TripRepository, "listForOrganization" | "cancelForOrganization">;
  requireOrganization: (request: Request) => Promise<{ organizationId: string }>;
}) {
  return {
    async list(request: Request): Promise<Response> {
      const { organizationId } = await deps.requireOrganization(request);
      return Response.json({ watches: await deps.trips.listForOrganization(organizationId) });
    },
    async cancel(request: Request, rawId: string): Promise<Response> {
      const origin = request.headers.get("origin");
      if (origin && origin !== new URL(request.url).origin) failure(403, "invalid_origin", "Origen no permitido.");
      const { organizationId } = await deps.requireOrganization(request);
      const id = z.uuid().safeParse(rawId);
      if (!id.success) failure(400, "invalid_input", "Vigilancia no válida.");
      // Unknown, finished and other organizations' watches look the same, so ids are not probeable.
      if (!(await deps.trips.cancelForOrganization(organizationId, id.data)))
        failure(404, "not_found", "La vigilancia no existe o ya terminó.");
      return Response.json({ cancelled: true });
    },
  };
}
