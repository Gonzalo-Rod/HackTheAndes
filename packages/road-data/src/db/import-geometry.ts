import type { Pool } from "pg";
import type { RoadNetworkSnapshot, CorridorBuild } from "../contracts/road-geometry.ts";

export async function persistRoadGeometry(
  pool: Pool,
  snapshot: RoadNetworkSnapshot,
  prepared: CorridorBuild,
) {
  const client = await pool.connect();
  let discard = false;
  try {
    await client.query("begin");
    const corridor = prepared.corridor.properties;
    await client.query(
      "insert into public.geometry_revisions (id, road_code, retrieved_at, source_urls, source_snapshot, measured_length_km) values ($1, $6, $2, $3::jsonb, $4::jsonb, $5) on conflict (id) do update set retrieved_at = excluded.retrieved_at, source_urls = excluded.source_urls, source_snapshot = excluded.source_snapshot where excluded.retrieved_at >= public.geometry_revisions.retrieved_at",
      [
        corridor.geometryRevision,
        snapshot.retrievedAt,
        JSON.stringify(snapshot.sourceUrls),
        JSON.stringify(snapshot),
        corridor.measuredLengthKm,
        corridor.roadCode,
      ],
    );
    // One bulk write avoids a network round trip per segment. Later enrichment is retained.
    await client.query(
      `
      insert into public.segments
        (id, geometry_revision, road_code, distance_from_origin_start_km,
         distance_from_origin_end_km, kilometer_calibration, source_references, geometry)
      select item->>'id', item#>>'{properties,geometryRevision}', item#>>'{properties,roadCode}',
        (item#>>'{properties,distanceFromOriginStartKm}')::double precision,
        (item#>>'{properties,distanceFromOriginEndKm}')::double precision,
        'unverified', item#>'{properties,sourceReferences}',
        extensions.st_setsrid(extensions.st_geomfromgeojson((item->'geometry')::text), 4326)
      from jsonb_array_elements($1::jsonb) item
      on conflict (id) do nothing
    `,
      [JSON.stringify(prepared.segments.features)],
    );
    await client.query("commit");
    return {
      geometryRevision: corridor.geometryRevision,
      segmentCount: prepared.segments.features.length,
    };
  } catch (error) {
    try {
      await client.query("rollback");
    } catch (rollbackError) {
      discard = true;
      throw new AggregateError(
        [error, rollbackError],
        "Geometry rollback failed; connection discarded",
        { cause: rollbackError },
      );
    }
    throw error;
  } finally {
    client.release(discard);
  }
}
