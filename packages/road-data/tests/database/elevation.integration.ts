import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { afterAll, test } from "vitest";
import { createDatabasePool } from "../../src/db/pool.ts";
import { loadDatabaseConfiguration } from "../../src/config/env.ts";
import { buildRoadCorridor } from "../../src/domain/road-data/build-corridor.ts";
import { persistRoadGeometry } from "../../src/db/import-geometry.ts";
import { preparePe22Elevation } from "../../src/services/prepare-pe22-elevation.ts";
import { importPe22Elevation } from "../../src/services/import-pe22-elevation.ts";
import { shortSnapshot } from "../geometry/support.ts";

const pool = createDatabasePool(loadDatabaseConfiguration());
const revisions: string[] = [];
async function fixture() {
  const revision = randomBytes(32).toString("hex");
  revisions.push(revision);
  const source = shortSnapshot();
  const geometry = buildRoadCorridor(source, () => revision);
  assert.ok(geometry.ok);
  await persistRoadGeometry(pool, source, geometry.value);
  const elevation = await preparePe22Elevation({
    segments: geometry.value.segments,
    clock: () => new Date("2026-10-17T21:00:00Z"),
    provider: {
      source: {
        provider: "fixture",
        dataset: "test-dem",
        spatialResolutionM: 90,
        attribution: "Synthetic test only",
        documentationUrl: "https://example.test/dem",
      },
      fetchElevations: async (positions) => ({
        values: positions.map((_, index) => 100 + index),
        sourceUrls: ["https://example.test/elevation"],
      }),
    },
  });
  assert.ok(elevation.ok);
  return elevation.value;
}
afterAll(async () => {
  try {
    await pool.query("delete from public.segments where geometry_revision = any($1::text[])", [
      revisions,
    ]);
    await pool.query("delete from public.geometry_revisions where id = any($1::text[])", [
      revisions,
    ]);
  } finally {
    await pool.end();
  }
});

test("elevation import is idempotent and preserves geometry and unverified official kilometers", async () => {
  const snapshot = await fixture();
  const first = await importPe22Elevation(pool, snapshot);
  assert.ok(first.ok);
  assert.equal(first.value.segmentsUpdated, snapshot.samples.length);
  const second = await importPe22Elevation(pool, snapshot);
  assert.ok(second.ok);
  assert.equal(second.value.segmentsUpdated, 0);
  const result = await pool.query<{ count: number; correct: boolean }>(
    `select count(*)::integer as count, bool_and(s.elevation_m = e.elevation_m
      and s.official_km_start is null and s.official_km_end is null
      and s.kilometer_calibration = 'unverified'
      and e.source->>'dataset' = 'test-dem') as correct
     from public.segments s join public.segment_elevations e on e.segment_id = s.id where s.geometry_revision = $1`,
    [snapshot.geometryRevision],
  );
  assert.equal(result.rows[0]?.count, snapshot.samples.length);
  assert.equal(result.rows[0]?.correct, true);
});

test("concurrent imports retain the newer elevation even if an older snapshot arrives later", async () => {
  const snapshot = await fixture();
  const newer = {
    ...snapshot,
    retrievedAt: "2026-10-17T22:00:00Z",
    samples: snapshot.samples.map((sample) => ({ ...sample, elevationM: sample.elevationM + 10 })),
  };
  for (const result of await Promise.all([
    importPe22Elevation(pool, snapshot),
    importPe22Elevation(pool, newer),
  ]))
    assert.ok(result.ok);
  const stale = await importPe22Elevation(pool, snapshot);
  assert.ok(stale.ok);
  assert.equal(stale.value.samplesUpserted, 0);
  assert.equal(stale.value.segmentsUpdated, 0);
  const actual = await pool.query<{ elevation_m: number }>(
    "select elevation_m from public.segments where id = $1",
    [snapshot.samples[0]?.segmentId],
  );
  assert.equal(actual.rows[0]?.elevation_m, newer.samples[0]?.elevationM);
});

test("incomplete, unknown-revision, and off-road samples roll back without partial enrichment", async () => {
  const snapshot = await fixture();
  for (const input of [
    { ...snapshot, samples: snapshot.samples.slice(1) },
    { ...snapshot, geometryRevision: "f".repeat(64) },
    {
      ...snapshot,
      samples: snapshot.samples.map((sample) => ({
        ...sample,
        distanceFromOriginKm: sample.distanceFromOriginKm + 1,
      })),
    },
    {
      ...snapshot,
      samples: snapshot.samples.map((sample, index) =>
        index === 0 ? { ...sample, position: [0, 0] } : sample,
      ),
    },
  ])
    assert.equal((await importPe22Elevation(pool, input)).ok, false);
  const actual = await pool.query<{ count: number }>(
    "select count(*)::integer as count from public.segments where geometry_revision = $1 and elevation_m is not null",
    [snapshot.geometryRevision],
  );
  assert.equal(actual.rows[0]?.count, 0);
  assert.ok((await importPe22Elevation(pool, snapshot)).ok);
});
