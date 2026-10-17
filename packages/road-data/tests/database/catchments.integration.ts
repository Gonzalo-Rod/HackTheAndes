import { randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { beforeAll, afterAll, expect, it } from "vitest";
import { loadDatabaseConfiguration } from "../../src/config/env.ts";
import { createDatabasePool } from "../../src/db/pool.ts";
import { persistCatchments, readCatchments } from "../../src/db/catchments.ts";
import { catchmentSnapshotSchema } from "../../src/contracts/road-catchments.ts";
const pool = createDatabasePool(loadDatabaseConfiguration());
const revision = randomBytes(32).toString("hex");
const segmentId = `catchment-test-${randomUUID()}`;
const original = catchmentSnapshotSchema.parse(
  JSON.parse(await readFile(new URL("../../data/pe22/catchments.json", import.meta.url), "utf8")),
);
const snapshot = {
  ...original,
  geometryRevision: revision,
  diagnostics: { ...original.diagnostics, linkedSegments: 1 },
  features: original.features.map((feature) => ({
    ...feature,
    properties: {
      ...feature.properties,
      segmentIds: [segmentId],
      crossings: feature.properties.crossings.map((crossing) => ({
        ...crossing,
        segmentIds: [segmentId],
      })),
    },
  })),
};
beforeAll(async () => {
  await pool.query(
    "insert into public.geometry_revisions(id,road_code,retrieved_at,source_urls,source_snapshot,measured_length_km) values($1,'PE-22',now(),'{}','{}',1)",
    [revision],
  );
  await pool.query(
    "insert into public.segments(id,geometry_revision,road_code,distance_from_origin_start_km,distance_from_origin_end_km,kilometer_calibration,source_references,geometry) values($1,$2,'PE-22',0,1,'unverified','[]',extensions.st_geomfromtext('LINESTRING(-77 -12,-76.99 -12)',4326))",
    [segmentId, revision],
  );
});
afterAll(async () => {
  try {
    await pool.query("delete from public.catchment_snapshots where geometry_revision=$1", [
      revision,
    ]);
    await pool.query("delete from public.catchments where geometry_revision=$1", [revision]);
    await pool.query("delete from public.segments where geometry_revision=$1", [revision]);
    await pool.query("delete from public.geometry_revisions where id=$1", [revision]);
  } finally {
    await pool.end();
  }
});
it("persists geometry, provenance, samples and links without duplicate catchments on retries", async () => {
  await persistCatchments(pool, snapshot);
  await persistCatchments(pool, snapshot);
  expect(await readCatchments(pool, revision)).toEqual(snapshot);
  const result = await pool.query(
    "select count(*)::integer as count from public.catchments where geometry_revision=$1",
    [revision],
  );
  expect(result.rows[0]?.count).toBe(snapshot.features.length);
});
it("preserves the committed snapshot when association validation fails", async () => {
  await expect(
    persistCatchments(pool, {
      ...snapshot,
      features: snapshot.features.map((feature) => ({
        ...feature,
        properties: {
          ...feature.properties,
          segmentIds: ["unknown-segment"],
          crossings: feature.properties.crossings.map((crossing) => ({
            ...crossing,
            segmentIds: ["unknown-segment"],
          })),
        },
      })),
    }),
  ).rejects.toThrow("persistence failed");
  expect(await readCatchments(pool, revision)).toEqual(snapshot);
});

it("removes obsolete source links while preserving historical polygons and rejects stale snapshots", async () => {
  const feature = snapshot.features[0];
  if (!feature) throw new Error("Missing catchment fixture");
  const newer = {
    ...snapshot,
    preparedAt: new Date(Date.parse(snapshot.preparedAt) + 1000).toISOString(),
    features: [feature],
    diagnostics: {
      coarseBasinCount: 1,
      linkedSegments: 1,
      crossingCount: feature.properties.crossings.length,
    },
  };
  await persistCatchments(pool, newer);
  const result = await pool.query(
    "select count(*)::int as count from public.segment_catchments sc join public.catchments c on c.id=sc.catchment_id where c.geometry_revision=$1",
    [revision],
  );
  expect(result.rows[0]?.count).toBe(1);
  expect(await persistCatchments(pool, snapshot)).toEqual({ state: "preserved_newer_snapshot" });
  expect(await readCatchments(pool, revision)).toEqual(newer);
});
