import type { Pool } from "pg";
import { z } from "zod";
import {
  spatialContextSchema,
  officialContextArchiveSchema,
  type RoadContextRepository,
} from "../contracts/road-context.ts";

export function createPostgresRoadContextRepository(
  pool: Pool,
  revision: string,
): RoadContextRepository {
  const geometryRevision = z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .parse(revision);
  return {
    async readSpatial() {
      const result = await pool.query(
        `select r.source_snapshot as source, g.snapshot as gazetteer
        from public.gazetteer_snapshots g join public.geometry_revisions r on r.id=g.geometry_revision
        where g.provider='mtc-ign' and g.geometry_revision=$1`,
        [geometryRevision],
      );
      if (!result.rows[0]) throw new Error("No spatial context has been imported");
      return spatialContextSchema.parse(result.rows[0]);
    },
    async readOfficial() {
      // Both subqueries use one MVCC snapshot, including successful empty polls.
      const result = await pool.query(`select
        coalesce((select jsonb_agg(state order by external_id) from private.official_alerts
          where source='sutran' and state#>>'{alert,roadCode}'='PE-22'), '[]'::jsonb) as records,
        (select jsonb_build_object('startedAt',started_at,'finishedAt',finished_at)
          from private.ingestion_runs where provider='sutran' and status='complete' and finished_at is not null
          order by finished_at desc limit 1) as poll`);
      return officialContextArchiveSchema.parse(z.unknown().parse(result.rows[0]));
    },
  };
}
