import { z } from "zod";
import type { Pool } from "pg";
import {
  elevationSnapshotSchema,
  type ElevationSnapshot,
  type ElevationResult,
} from "../contracts/road-elevation.ts";

// Allow numerical differences between Turf's sphere and PostGIS's spheroid, not off-road sampling.
const MAX_SAMPLE_DISTANCE_FROM_ROAD_M = 5;
// One millimeter of chainage allows only floating-point serialization differences.
const CHAINAGE_TOLERANCE_KM = 1e-6;
export interface ElevationImportSummary {
  geometryRevision: string;
  sampleCount: number;
  samplesUpserted: number;
  segmentsUpdated: number;
}

export async function persistSegmentElevations(
  pool: Pool,
  input: ElevationSnapshot,
): Promise<ElevationResult<ElevationImportSummary>> {
  const snapshot = elevationSnapshotSchema.parse(input);
  const client = await pool.connect();
  let discard = false;
  try {
    await client.query("begin");
    // Serializing by ordered segment IDs makes freshness checks safe for concurrent imports.
    const stored = z
      .array(z.object({ id: z.string() }))
      .parse(
        (
          await client.query(
            "select id from public.segments where geometry_revision = $1 order by id for update",
            [snapshot.geometryRevision],
          )
        ).rows,
      );
    const ids = new Set(stored.map((row) => row.id));
    if (
      stored.length !== snapshot.samples.length ||
      snapshot.samples.some((sample) => !ids.has(sample.segmentId))
    ) {
      await client.query("rollback");
      return {
        ok: false,
        error: {
          code: "incomplete_coverage",
          message: "Elevation must cover exactly the stored segments for its geometry revision",
        },
      };
    }
    const samples = JSON.stringify(snapshot.samples);
    const matched = z.object({ count: z.number().int() }).parse(
      (
        await client.query(
          `select count(*)::integer as count
       from jsonb_array_elements($1::jsonb) item
       join public.segments s on s.id = item->>'segmentId' and s.geometry_revision = $2
       where extensions.st_dwithin(s.geometry::extensions.geography,
         extensions.st_setsrid(extensions.st_makepoint((item#>>'{position,0}')::double precision,
           (item#>>'{position,1}')::double precision),4326)::extensions.geography, $3)
         and abs((s.distance_from_origin_start_km + s.distance_from_origin_end_km) / 2
           - (item->>'distanceFromOriginKm')::double precision) <= $4`,
          [
            samples,
            snapshot.geometryRevision,
            MAX_SAMPLE_DISTANCE_FROM_ROAD_M,
            CHAINAGE_TOLERANCE_KM,
          ],
        )
      ).rows[0],
    );
    if (matched.count !== snapshot.samples.length) {
      await client.query("rollback");
      return {
        ok: false,
        error: {
          code: "off_road_sample",
          message: "An elevation sample's location or chainage does not match its stored segment",
        },
      };
    }
    const upsert = await client.query(
      `insert into public.segment_elevations
         (segment_id, geometry_revision, elevation_m, sample_position, distance_from_origin_km,
          sampling_method, source, source_urls, retrieved_at)
       select item->>'segmentId', $2, (item->>'elevationM')::double precision,
         extensions.st_setsrid(extensions.st_makepoint((item#>>'{position,0}')::double precision,
           (item#>>'{position,1}')::double precision),4326),
         (item->>'distanceFromOriginKm')::double precision, 'segment_midpoint', $3::jsonb, $4::jsonb, $5::timestamptz
       from jsonb_array_elements($1::jsonb) item
       on conflict (segment_id) do update set
         elevation_m = excluded.elevation_m, sample_position = excluded.sample_position,
         distance_from_origin_km = excluded.distance_from_origin_km,
         source = excluded.source, source_urls = excluded.source_urls, retrieved_at = excluded.retrieved_at
       where excluded.retrieved_at >= public.segment_elevations.retrieved_at`,
      [
        samples,
        snapshot.geometryRevision,
        JSON.stringify(snapshot.source),
        JSON.stringify(snapshot.sourceUrls),
        snapshot.retrievedAt,
      ],
    );
    const updated = await client.query(
      `update public.segments s set elevation_m = e.elevation_m from public.segment_elevations e
       where s.id = e.segment_id and s.geometry_revision = $1 and e.geometry_revision = $1
         and s.elevation_m is distinct from e.elevation_m`,
      [snapshot.geometryRevision],
    );
    await client.query("commit");
    return {
      ok: true,
      value: {
        geometryRevision: snapshot.geometryRevision,
        sampleCount: snapshot.samples.length,
        samplesUpserted: upsert.rowCount ?? 0,
        segmentsUpdated: updated.rowCount ?? 0,
      },
    };
  } catch (error) {
    try {
      await client.query("rollback");
    } catch (rollbackError) {
      discard = true;
      throw new AggregateError(
        [error, rollbackError],
        "Elevation rollback failed; connection discarded",
        { cause: rollbackError },
      );
    }
    throw error;
  } finally {
    client.release(discard);
  }
}
