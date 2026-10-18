/** A route follows the captured, ordered PE-22 axis; it does not choose alternative roads. */
export function createCorridorRoute(
  origin: { distanceKm: number; label: string; geometryRevision: string },
  destination: { distanceKm: number; label: string; geometryRevision: string },
  bounds: { startKm: number; endKm: number; geometryRevision: string },
) {
  if (
    origin.geometryRevision !== bounds.geometryRevision ||
    destination.geometryRevision !== bounds.geometryRevision
  )
    return { ok: false as const, error: "geometry_mismatch" as const };
  const startKm = Math.min(origin.distanceKm, destination.distanceKm);
  const endKm = Math.max(origin.distanceKm, destination.distanceKm);
  if (
    ![startKm, endKm, bounds.startKm, bounds.endKm].every(Number.isFinite) ||
    startKm < 0 ||
    bounds.startKm < 0 ||
    startKm < bounds.startKm ||
    endKm > bounds.endKm
  )
    return { ok: false as const, error: "outside_corridor" as const };
  if (startKm === endKm) return { ok: false as const, error: "same_endpoint" as const };
  return {
    ok: true as const,
    value: {
      startKm,
      endKm,
      geometryRevision: bounds.geometryRevision,
      label: `${origin.label} → ${destination.label}`,
    },
  };
}
