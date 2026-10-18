import { randomBytes } from "node:crypto";
import { beforeAll, afterAll, expect, it } from "vitest";
import { loadDatabaseConfiguration } from "../../src/config/env.ts";
import { createDatabasePool } from "../../src/db/pool.ts";
import { createExposureRepository } from "../../src/db/exposure.ts";
import { exposureHash, exposureIdentity } from "../../src/domain/exposure/record.ts";
import { calculateExposure } from "../../src/domain/exposure/assessment.ts";
import { capturedExposure } from "../exposure/support.ts";
import type { ExposureRecord } from "../../src/contracts/exposure-input.ts";
const pool = createDatabasePool(loadDatabaseConfiguration());
const repository = createExposureRepository(pool);
const revision = randomBytes(32).toString("hex");
let record: ExposureRecord;
function variant(weatherDeltaMs: number, assessedDeltaMs = 0): ExposureRecord {
  const input = structuredClone(record.input);
  input.weather.capturedAt = new Date(
    Date.parse(input.weather.capturedAt) + weatherDeltaMs,
  ).toISOString();
  input.sourceHashes.weather = exposureHash(input.weather);
  const policy = record.assessment.policy;
  return {
    input,
    assessment: calculateExposure(input, policy, {
      assessmentId: exposureIdentity(input, policy),
      policySha256: exposureHash(policy),
      assessedAt: new Date(
        Math.max(
          Date.parse(record.assessment.assessedAt) + assessedDeltaMs,
          Date.parse(input.weather.capturedAt) + 1000,
        ),
      ).toISOString(),
    }),
  };
}
beforeAll(async () => {
  const fixture = await capturedExposure();
  const input = structuredClone(fixture.record.input);
  input.geometryRevision = revision;
  input.weather.geometryRevision = revision;
  input.sourceHashes.weather = exposureHash(input.weather);
  input.segments.forEach((s) => {
    s.geometryRevision = revision;
  });
  const policy = fixture.record.assessment.policy;
  record = {
    input,
    assessment: calculateExposure(input, policy, {
      assessmentId: exposureIdentity(input, policy),
      policySha256: exposureHash(policy),
      assessedAt: fixture.at,
    }),
  };
  await pool.query(
    "insert into public.geometry_revisions(id,road_code,retrieved_at,source_urls,source_snapshot,measured_length_km) values($1,'PE-22',now(),'{}','{}',1)",
    [revision],
  );
});
afterAll(async () => {
  try {
    await pool.query("delete from public.climate_exposure_assessments where geometry_revision=$1", [
      revision,
    ]);
    await pool.query("delete from public.geometry_revisions where id=$1", [revision]);
  } finally {
    await pool.end();
  }
});
it("persists immutable complete batches and preserves the first result on retries", async () => {
  expect((await repository.save(record)).state).toBe("stored");
  const retry = variant(0, 1000);
  const result = await repository.save(retry);
  expect(result.state).toBe("preserved");
  expect(result.record).toEqual(record);
  expect(await repository.readLatest(revision)).toEqual(record);
  const total = await pool.query(
    "select count(*)::int as count from public.climate_exposure_assessments where geometry_revision=$1",
    [revision],
  );
  expect(total.rows[0].count).toBe(1);
});
it("selects the newest source capture rather than a late retry of older weather", async () => {
  const older = variant(-3_600_000, 20_000);
  await repository.save(older);
  expect((await repository.readLatest(revision))?.assessment.assessmentId).toBe(
    record.assessment.assessmentId,
  );
  expect(await repository.readLatest("f".repeat(64))).toBeNull();
});
it("rejects corrupt payloads before insertion and checks stored content hashes on read", async () => {
  const bad = structuredClone(record);
  bad.assessment.policySha256 = "0".repeat(64);
  await expect(repository.save(bad)).rejects.toThrow("identity");
  const newest = variant(3_600_000);
  const a = newest.assessment;
  try {
    await pool.query(
      `insert into public.climate_exposure_assessments(id,geometry_revision,policy_sha256,weather_captured_at,assessed_at,content_sha256,payload)
      values($1,$2,$3,$4,$5,$6,$7)`,
      [
        a.assessmentId,
        revision,
        a.policySha256,
        a.sources.weatherCapturedAt,
        a.assessedAt,
        "0".repeat(64),
        JSON.stringify(newest),
      ],
    );
    await expect(repository.readLatest(revision)).rejects.toThrow("checksum");
  } finally {
    await pool.query("delete from public.climate_exposure_assessments where id=$1", [
      a.assessmentId,
    ]);
  }
});
it("denies browser roles and backend updates while keeping backend reads scoped by policy", async () => {
  const result = await pool.query(`select
    has_table_privilege('anon','public.climate_exposure_assessments','SELECT') as anon_read,
    has_table_privilege('authenticated','public.climate_exposure_assessments','INSERT') as browser_write,
    has_table_privilege('peruroad_backend','public.climate_exposure_assessments','UPDATE') as backend_update,
    (select relrowsecurity from pg_class where oid='public.climate_exposure_assessments'::regclass) as rls`);
  expect(result.rows[0]).toEqual({
    anon_read: false,
    browser_write: false,
    backend_update: false,
    rls: true,
  });
});
