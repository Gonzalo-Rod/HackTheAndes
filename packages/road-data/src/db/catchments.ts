import type { Pool } from "pg";
import { z } from "zod";
import { catchmentSnapshotSchema, type CatchmentSnapshot } from "../contracts/road-catchments.ts";

export async function persistCatchments(pool: Pool, input: unknown) {
  const snapshot = catchmentSnapshotSchema.parse(input);
  const client = await pool.connect();
  let discard = false;
  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
      `catchments:${snapshot.geometryRevision}`,
    ]);
    const identifiers = [
      ...new Set(snapshot.features.flatMap((feature) => feature.properties.segmentIds)),
    ];
    const segments = await client.query(
      "select id from public.segments where geometry_revision=$1 and id=any($2::text[])",
      [snapshot.geometryRevision, identifiers],
    );
    if (segments.rowCount !== identifiers.length)
      throw new Error("Catchment links reference missing or different-revision road segments");
    const previous = await client.query(
      "select prepared_at > $2::timestamptz as newer from public.catchment_snapshots where geometry_revision=$1",
      [snapshot.geometryRevision, snapshot.preparedAt],
    );
    if (previous.rows[0] && z.object({ newer: z.boolean() }).parse(previous.rows[0]).newer) {
      await client.query("commit");
      return { state: "preserved_newer_snapshot" as const };
    }
    await client.query(
      `insert into public.catchments(external_id,geometry_revision,name,geometry,pour_point,area_km2,mean_slope_degrees,method,sample_points,low_confidence,provenance)
      select item->>'id',$2,item->>'id',extensions.st_setsrid(extensions.st_geomfromgeojson((item->'geometry')::text),4326),
      extensions.st_setsrid(extensions.st_makepoint((item#>>'{properties,pourPoint,0}')::float8,(item#>>'{properties,pourPoint,1}')::float8),4326),
      (item#>>'{properties,areaKm2}')::float8,null,'hydrobasins',item#>'{properties,samplePoints}',true,
      $3::jsonb || jsonb_build_object('upstreamIds',item#>'{properties,upstreamIds}','crossings',item#>'{properties,crossings}')
      from jsonb_array_elements($1::jsonb) item
      on conflict(external_id,geometry_revision) do update set geometry=excluded.geometry,pour_point=excluded.pour_point,area_km2=excluded.area_km2,
      sample_points=excluded.sample_points,provenance=excluded.provenance`,
      [
        JSON.stringify(snapshot.features),
        snapshot.geometryRevision,
        JSON.stringify(snapshot.provenance),
      ],
    );
    // Replace only links owned by this explicit source snapshot. Historical polygons remain addressable by model records.
    await client.query(
      "delete from public.segment_catchments sc using public.catchments c where sc.catchment_id=c.id and c.geometry_revision=$1 and c.external_id like 'hydrobasins-v1c-sa12-%'",
      [snapshot.geometryRevision],
    );
    const associations = snapshot.features.flatMap((feature) =>
      feature.properties.segmentIds.map((segmentId) => ({ externalId: feature.id, segmentId })),
    );
    await client.query(
      `insert into public.segment_catchments(segment_id,catchment_id)
      select item->>'segmentId',c.id from jsonb_array_elements($1::jsonb) item join public.catchments c on c.external_id=item->>'externalId' and c.geometry_revision=$2
      on conflict do nothing`,
      [JSON.stringify(associations), snapshot.geometryRevision],
    );
    await client.query(
      `insert into public.catchment_snapshots(geometry_revision,prepared_at,snapshot) values($1,$2,$3)
      on conflict(geometry_revision) do update set prepared_at=excluded.prepared_at,snapshot=excluded.snapshot`,
      [snapshot.geometryRevision, snapshot.preparedAt, JSON.stringify(snapshot)],
    );
    await client.query("commit");
    return {
      state: "stored" as const,
      catchments: snapshot.features.length,
      linkedSegments: identifiers.length,
      samplePoints: snapshot.features.reduce(
        (total, feature) => total + feature.properties.samplePoints.length,
        0,
      ),
    };
  } catch (error) {
    try {
      await client.query("rollback");
    } catch {
      discard = true;
    }
    throw new Error("Catchment persistence failed", { cause: error });
  } finally {
    client.release(discard);
  }
}
export async function readCatchments(
  pool: Pick<Pool, "query">,
  revision: string,
): Promise<CatchmentSnapshot | null> {
  const result = await pool.query(
    "select snapshot from public.catchment_snapshots where geometry_revision=$1",
    [revision],
  );
  return result.rows[0] ? catchmentSnapshotSchema.parse(result.rows[0].snapshot) : null;
}
