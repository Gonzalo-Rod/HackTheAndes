import type { Pool } from "pg";
import { z } from "zod";
import { MAX_ROAD_OFFSET_M } from "@peruroad/road-data/locations/contracts";

export interface RoadPosition {
  roadCode: string;
  geometryRevision: string;
  segmentId: string;
  /** Measured along the captured geometry; not an official kilometer marker. */
  distanceFromOriginKm: number;
  distanceFromRoadM: number;
}

const rowSchema = z.object({
  segmentId: z.string().min(1),
  roadCode: z.string().min(1),
  geometryRevision: z.string().regex(/^[a-f0-9]{64}$/),
  distanceFromOriginKm: z.number().nonnegative(),
  distanceFromRoadM: z.number().nonnegative(),
});

/**
 * Nearest segment of the given geometry revisions within the pilot's 500 m pin rule. Only revisions
 * the caller passes are searched, so unregistered or partial imports never answer a driver.
 */
export async function locateOnRoads(
  pool: Pool,
  revisions: readonly string[],
  position: { latitude: number; longitude: number },
): Promise<RoadPosition | null> {
  if (!revisions.length) return null;
  const result = await pool.query(
    `with pin as (select extensions.st_setsrid(extensions.st_makepoint($2, $3), 4326) as geom)
     select s.id as "segmentId", s.road_code as "roadCode", s.geometry_revision as "geometryRevision",
       (s.distance_from_origin_start_km + (s.distance_from_origin_end_km - s.distance_from_origin_start_km)
         * extensions.st_linelocatepoint(s.geometry, pin.geom))::float8 as "distanceFromOriginKm",
       extensions.st_distance(s.geometry::extensions.geography, pin.geom::extensions.geography)::float8 as "distanceFromRoadM"
     from public.segments s, pin
     where s.geometry_revision = any($1::text[])
       and extensions.st_dwithin(s.geometry::extensions.geography, pin.geom::extensions.geography, $4)
     order by "distanceFromRoadM", s.id
     limit 1`,
    [revisions, position.longitude, position.latitude, MAX_ROAD_OFFSET_M],
  );
  const row = result.rows[0];
  return row === undefined ? null : rowSchema.parse(row);
}
