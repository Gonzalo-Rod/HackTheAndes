import type { Pool } from "pg";
import { z } from "zod";
import { DEFAULT_EXPOSURE_POLICY } from "../domain/exposure/policy.ts";
import { exposureHash, validateExposureRecord } from "../domain/exposure/record.ts";
import type { ExposureRecord } from "../contracts/exposure-input.ts";
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const rowSchema = z.object({
  id: hash,
  geometry_revision: hash,
  policy_sha256: hash,
  content_sha256: hash,
  payload: z.unknown(),
});
function readRow(input: unknown): ExposureRecord {
  const row = rowSchema.parse(input);
  const record = validateExposureRecord(row.payload);
  if (
    record.assessment.assessmentId !== row.id ||
    record.assessment.geometryRevision !== row.geometry_revision ||
    record.assessment.policySha256 !== row.policy_sha256 ||
    exposureHash(record) !== row.content_sha256
  )
    throw new Error("Stored exposure checksum/envelope mismatch");
  return record;
}
export interface ExposureRepository {
  save(input: unknown): Promise<{ state: "stored" | "preserved"; record: ExposureRecord }>;
  readLatest(geometryRevision: string): Promise<ExposureRecord | null>;
  /** Deletes a revision's assessments captured before `capturedBefore`, always keeping the newest one. */
  prune(geometryRevision: string, capturedBefore: string): Promise<number>;
}
export function createExposureRepository(pool: Pick<Pool, "query">): ExposureRepository {
  return {
    async save(input) {
      const record = validateExposureRecord(input);
      const assessment = record.assessment;
      const saved = await pool.query(
        `insert into public.climate_exposure_assessments(id,geometry_revision,policy_sha256,weather_captured_at,assessed_at,content_sha256,payload)
         values($1,$2,$3,$4,$5,$6,$7) on conflict(id) do nothing returning id`,
        [
          assessment.assessmentId,
          assessment.geometryRevision,
          assessment.policySha256,
          assessment.sources.weatherCapturedAt,
          assessment.assessedAt,
          exposureHash(record),
          JSON.stringify(record),
        ],
      );
      const result = await pool.query(
        "select id,geometry_revision,policy_sha256,content_sha256,payload from public.climate_exposure_assessments where id=$1",
        [assessment.assessmentId],
      );
      if (!result.rows[0]) throw new Error("Exposure persistence was not confirmed");
      const stored = readRow(result.rows[0]);
      if (exposureHash(stored.input) !== exposureHash(record.input))
        throw new Error("Exposure identity collision");
      return { state: saved.rowCount === 1 ? "stored" : "preserved", record: stored };
    },
    async readLatest(geometryRevision) {
      hash.parse(geometryRevision);
      const result = await pool.query(
        `select id,geometry_revision,policy_sha256,content_sha256,payload from public.climate_exposure_assessments
         where geometry_revision=$1 and policy_sha256=$2 order by weather_captured_at desc,assessed_at desc,id desc limit 1`,
        [geometryRevision, exposureHash(DEFAULT_EXPOSURE_POLICY)],
      );
      return result.rows[0] ? readRow(result.rows[0]) : null;
    },
    async prune(geometryRevision, capturedBefore) {
      hash.parse(geometryRevision);
      z.iso.datetime({ offset: true }).parse(capturedBefore);
      const result = await pool.query(
        `delete from public.climate_exposure_assessments
         where geometry_revision=$1 and weather_captured_at<$2
           and id <> (select id from public.climate_exposure_assessments where geometry_revision=$1
                      order by weather_captured_at desc,assessed_at desc,id desc limit 1)`,
        [geometryRevision, capturedBefore],
      );
      return result.rowCount ?? 0;
    },
  };
}
