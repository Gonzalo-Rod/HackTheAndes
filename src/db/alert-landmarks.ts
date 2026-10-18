import type { Pool } from "pg";
import { z } from "zod";
import type { AlertLandmark } from "@/domain/alerts/messages";

export async function readAlertLandmarks(pool: Pick<Pool, "query">, revision: string): Promise<AlertLandmark[]> {
  const result = await pool.query(
    `select name,source_kind as kind,distance_from_origin_km::float8 as "distanceKm" from public.gazetteer
     where provider='mtc-ign' and geometry_revision=$1 and road_code='PE-22'
     and source_kind in ('bridge','sos','toll') and length(trim(name))>0 and distance_from_origin_km is not null`,
    [revision],
  );
  return z
    .array(z.object({ name: z.string().trim().min(1), kind: z.enum(["bridge", "sos", "toll"]), distanceKm: z.number().nonnegative() }))
    .parse(result.rows);
}
