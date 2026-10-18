import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import type { Pool } from "pg";
import {
  gazetteerSchema,
  type Gazetteer,
  type LocationResult,
} from "../contracts/road-locations.ts";

export interface GazetteerImportSummary {
  geometryRevision: string;
  entryCount: number;
  changed: boolean;
  stale: boolean;
}
export async function persistGazetteer(
  pool: Pool,
  snapshot: Gazetteer,
): Promise<LocationResult<GazetteerImportSummary>> {
  const client = await pool.connect();
  let discard = false;
  try {
    await client.query("begin");
    // The parent row also serializes the first import when no snapshot row exists yet.
    const parent = await client.query(
      "select id from public.geometry_revisions where id=$1 for update",
      [snapshot.geometryRevision],
    );
    if (!parent.rowCount) {
      await client.query("rollback");
      return {
        ok: false,
        error: {
          code: "unknown_revision",
          message: "Import the source road revision before its gazetteer",
        },
      };
    }
    const previous = await client.query(
      "select snapshot from public.gazetteer_snapshots where provider='mtc-ign' and geometry_revision=$1",
      [snapshot.geometryRevision],
    );
    const existing = previous.rows[0]
      ? gazetteerSchema.parse(z.object({ snapshot: z.unknown() }).parse(previous.rows[0]).snapshot)
      : undefined;
    const stale =
      !!existing &&
      Date.parse(existing.source.retrievedAt) > Date.parse(snapshot.source.retrievedAt);
    const summary = {
      geometryRevision: snapshot.geometryRevision,
      entryCount: stale && existing ? existing.entries.length : snapshot.entries.length,
      changed: false,
      stale,
    };
    if (existing && (stale || isDeepStrictEqual(existing, snapshot))) {
      await client.query("commit");
      return { ok: true, value: summary };
    }
    const ids = z
      .array(z.object({ id: z.string() }))
      .parse(
        (
          await client.query("select id from public.segments where geometry_revision=$1", [
            snapshot.geometryRevision,
          ])
        ).rows,
      );
    const known = new Set(ids.map((row) => row.id));
    if (snapshot.entries.some((entry) => !known.has(entry.location.segmentId))) {
      await client.query("rollback");
      return {
        ok: false,
        error: {
          code: "invalid_snapshot",
          message: "Gazetteer entries reference an unknown segment",
        },
      };
    }
    // Replace only this provider/revision's rows; legacy entries and historical revisions survive.
    await client.query(
      "delete from public.gazetteer where provider='mtc-ign' and geometry_revision=$1 and not (source_id = any($2::text[]))",
      [snapshot.geometryRevision, snapshot.entries.map((entry) => entry.sourceId)],
    );
    await client.query(
      `insert into public.gazetteer
      (road_code,name,aliases,location,official_km,segment_id,source_url,retrieved_at,verified,
       provider,source_id,source_kind,geometry_revision,reported_road_code,reported_km,
       distance_from_origin_km,distance_from_road_m,snapped_location)
      select 'PE-22', item->>'name', array(select jsonb_array_elements_text(item->'aliases')),
        extensions.st_setsrid(extensions.st_makepoint((item#>>'{position,0}')::double precision,(item#>>'{position,1}')::double precision),4326),
        null, item#>>'{location,segmentId}', item->>'sourceUrl', $3::timestamptz, false,
        'mtc-ign', item->>'sourceId', item->>'kind', $2, item->>'reportedRoadCode',
        (item->>'reportedKm')::double precision, (item#>>'{location,distanceFromOriginKm}')::double precision,
        (item#>>'{location,distanceFromRoadM}')::double precision,
        extensions.st_setsrid(extensions.st_makepoint((item#>>'{location,snappedPosition,0}')::double precision,(item#>>'{location,snappedPosition,1}')::double precision),4326)
      from jsonb_array_elements($1::jsonb) item
      on conflict (provider,geometry_revision,source_id) do update set
        name=excluded.name, aliases=excluded.aliases, location=excluded.location, segment_id=excluded.segment_id,
        source_url=excluded.source_url, retrieved_at=excluded.retrieved_at,
        reported_road_code=excluded.reported_road_code, reported_km=excluded.reported_km,
        distance_from_origin_km=excluded.distance_from_origin_km, distance_from_road_m=excluded.distance_from_road_m,
        snapped_location=excluded.snapped_location`,
      [JSON.stringify(snapshot.entries), snapshot.geometryRevision, snapshot.source.retrievedAt],
    );
    await client.query(
      "insert into public.gazetteer_snapshots (provider,geometry_revision,retrieved_at,snapshot) values ('mtc-ign',$1,$2,$3::jsonb) on conflict (provider,geometry_revision) do update set retrieved_at=excluded.retrieved_at,snapshot=excluded.snapshot",
      [snapshot.geometryRevision, snapshot.source.retrievedAt, JSON.stringify(snapshot)],
    );
    await client.query("commit");
    return { ok: true, value: { ...summary, changed: true } };
  } catch (error) {
    try {
      await client.query("rollback");
    } catch (rollbackError) {
      discard = true;
      throw new AggregateError(
        [error, rollbackError],
        "Gazetteer rollback failed; connection discarded",
        { cause: rollbackError },
      );
    }
    throw error;
  } finally {
    client.release(discard);
  }
}
