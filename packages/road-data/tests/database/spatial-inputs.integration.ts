import { randomBytes, randomUUID, randomInt } from "node:crypto";
import { beforeAll, afterAll, expect, it } from "vitest";
import { createDatabasePool } from "../../src/db/pool.ts";
import { loadDatabaseConfiguration } from "../../src/config/env.ts";
import { persistHazards, persistTerrain } from "../../src/db/spatial-inputs.ts";
import {
  readBundledHazards,
  readBundledHazardSource,
  readBundledTerrain,
} from "../../src/integrations/hydrobasins/model-input-files.ts";

const pool = createDatabasePool(loadDatabaseConfiguration());
const revision = randomBytes(32).toString("hex");
const externalId = `terrain-test:${randomUUID()}`;
const warningId = `warning-test:${randomUUID()}`;
const polygonId = randomInt(2 ** 40, 2 ** 41);
const [prepared, raw, terrain] = await Promise.all([
  readBundledHazards(),
  readBundledHazardSource(),
  readBundledTerrain(),
]);
const polygon = raw.susceptibility.features[0];
const warning = raw.warnings.features[0];
const slope = terrain.catchments[0];
if (!polygon || !warning || !slope) throw new Error("Missing spatial test fixture");
const source = {
  ...raw,
  geometryRevision: revision,
  susceptibility: { ...raw.susceptibility, features: [{ ...polygon, id: polygonId }] },
  warnings: { ...raw.warnings, nationalFeatureCount: 1, features: [{ ...warning, id: warningId }] },
};
const capture = {
  ...prepared,
  ...source,
  // Source warnings outside the display corridor must still be persisted for audit.
  warnings: { ...source.warnings, features: [] },
};
const terrainInput = {
  ...terrain,
  geometryRevision: revision,
  catchments: [{ ...slope, catchmentId: externalId }],
};

beforeAll(async () => {
  await pool.query(
    "insert into public.geometry_revisions(id,road_code,retrieved_at,source_urls,source_snapshot,measured_length_km) values($1,'PE-22',now(),'{}','{}',1)",
    [revision],
  );
  await pool.query(
    `insert into public.catchments(external_id,geometry_revision,geometry,pour_point,area_km2,method,provenance)
    values($1,$2,extensions.st_geomfromtext('MULTIPOLYGON(((-77 -12,-76.99 -12,-76.99 -11.99,-77 -12)))',4326),extensions.st_geomfromtext('POINT(-77 -12)',4326),1,'hydrobasins','{}')`,
    [externalId, revision],
  );
});
afterAll(async () => {
  try {
    await pool.query(
      "delete from public.hazard_layers where provider='ingemmet' and external_id=$1",
      [String(polygonId)],
    );
    await pool.query(
      "delete from public.official_warnings where provider='senamhi' and external_id=$1",
      [warningId],
    );
    await pool.query("delete from public.data_snapshots where geometry_revision=$1", [revision]);
    await pool.query("delete from public.catchments where geometry_revision=$1", [revision]);
    await pool.query("delete from public.geometry_revisions where id=$1", [revision]);
  } finally {
    await pool.end();
  }
});

it("atomically preserves original polygons and national warnings separately from the display snapshot", async () => {
  expect((await persistHazards(pool, capture, source)).state).toBe("stored");
  expect((await persistHazards(pool, capture, source)).state).toBe("preserved");
  const result = await pool.query(
    `select
    (select count(*)::int from public.hazard_layers where provider='ingemmet' and external_id=$1 and extensions.st_isvalid(geometry)) as polygons,
    (select count(*)::int from public.official_warnings where external_id=$2 and issued_at is null and payload->>'automatedRiskUse'='false') as warnings,
    (select count(*)::int from public.data_snapshots where geometry_revision=$3) as snapshots`,
    [String(polygonId), warningId, revision],
  );
  expect(result.rows[0]).toEqual({ polygons: 1, warnings: 1, snapshots: 2 });
  const older = new Date(Date.parse(capture.capturedAt) - 1000).toISOString();
  expect(
    (
      await persistHazards(
        pool,
        { ...capture, capturedAt: older },
        { ...source, capturedAt: older },
      )
    ).state,
  ).toBe("preserved");
  await expect(
    persistHazards(pool, capture, { ...source, geometryRevision: "f".repeat(64) }),
  ).rejects.toThrow("does not match");
});
it("rolls back partial terrain updates and retains newer values during stale retries", async () => {
  expect((await persistTerrain(pool, terrainInput)).state).toBe("stored");
  const newer = new Date(Date.parse(terrain.capturedAt) + 1000).toISOString();
  await expect(
    persistTerrain(pool, {
      ...terrainInput,
      capturedAt: newer,
      catchments: [
        {
          ...slope,
          catchmentId: externalId,
          estimatedMeanSlopeDegrees: 1,
          samples: slope.samples.map((sample) => ({ ...sample, slopeDegrees: 1 })),
        },
        { ...slope, catchmentId: "unknown-test-catchment" },
      ],
    }),
  ).rejects.toThrow("persistence failed");
  const result = await pool.query(
    "select mean_slope_degrees from public.catchments where external_id=$1 and geometry_revision=$2",
    [externalId, revision],
  );
  expect(result.rows[0]?.mean_slope_degrees).toBeCloseTo(slope.estimatedMeanSlopeDegrees, 10);
  expect(
    (
      await persistTerrain(pool, {
        ...terrainInput,
        capturedAt: new Date(Date.parse(terrain.capturedAt) - 1000).toISOString(),
      })
    ).state,
  ).toBe("preserved");
});
