import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { afterAll, test } from "vitest";
import { createDatabasePool } from "../../src/db/pool.ts";
import { loadDatabaseConfiguration } from "../../src/config/env.ts";
import { persistRoadGeometry } from "../../src/db/import-geometry.ts";
import { prepareRoadGeometry } from "../../src/services/prepare-road-geometry.ts";
import { importPe22Gazetteer } from "../../src/services/import-pe22-gazetteer.ts";
import { buildGazetteer } from "../../src/domain/road-data/build-gazetteer.ts";
import { shortSnapshot } from "../geometry/support.ts";
import { source } from "../locations/support.ts";

const pool = createDatabasePool(loadDatabaseConfiguration());
const revisions: string[] = [];
async function fixture() {
  const road = shortSnapshot();
  // Change the actual geometry so normal content hashing yields isolated test revisions.
  const shift = (randomBytes(4).readUInt32BE() / 2 ** 32) * 0.01;
  for (const feature of road.features) {
    assert.equal(feature.geometry.type, "LineString");
    if (feature.geometry.type !== "LineString") throw new Error("Unexpected fixture geometry");
    feature.geometry.coordinates = feature.geometry.coordinates.map(([lon, lat]) => [
      lon,
      lat + shift,
    ]);
  }
  const geometry = prepareRoadGeometry(road);
  assert.ok(geometry.ok);
  revisions.push(geometry.value.corridor.properties.geometryRevision);
  await persistRoadGeometry(pool, road, geometry.value);
  const input = source();
  input.landmarks = input.landmarks.map((row) => ({
    ...row,
    position: [row.position[0], row.position[1] + shift],
  }));
  const gazetteer = buildGazetteer(geometry.value.segments, input);
  assert.ok(gazetteer.ok);
  return { geometry: geometry.value, gazetteer: gazetteer.value };
}
afterAll(async () => {
  try {
    await pool.query("delete from public.gazetteer where geometry_revision=any($1::text[])", [
      revisions,
    ]);
    await pool.query(
      "delete from public.gazetteer_snapshots where geometry_revision=any($1::text[])",
      [revisions],
    );
    await pool.query("delete from public.segments where geometry_revision=any($1::text[])", [
      revisions,
    ]);
    await pool.query("delete from public.geometry_revisions where id=any($1::text[])", [revisions]);
  } finally {
    await pool.end();
  }
});

test("gazetteer repeat import preserves identities, source kilometers, and unverified calibration", async () => {
  const { gazetteer } = await fixture();
  const first = await importPe22Gazetteer(pool, gazetteer);
  assert.ok(first.ok);
  assert.equal(first.value.changed, true);
  const ids = await pool.query<{ id: string }>(
    "select id from public.gazetteer where geometry_revision=$1 order by source_id",
    [gazetteer.geometryRevision],
  );
  const second = await importPe22Gazetteer(pool, gazetteer);
  assert.ok(second.ok);
  assert.equal(second.value.changed, false);
  const rows = await pool.query<{
    id: string;
    official_km: number | null;
    verified: boolean;
    reported_km: number;
  }>(
    "select id,official_km,verified,reported_km from public.gazetteer where geometry_revision=$1 order by source_id",
    [gazetteer.geometryRevision],
  );
  assert.deepEqual(
    rows.rows.map((row) => row.id),
    ids.rows.map((row) => row.id),
  );
  assert.ok(rows.rows.every((row) => row.official_km === null && !row.verified));
  assert.equal(rows.rows[0]?.reported_km, 48.5);
  const segments = await pool.query<{ uncalibrated: boolean }>(
    "select bool_and(official_km_start is null and official_km_end is null and kilometer_calibration='unverified') as uncalibrated from public.segments where geometry_revision=$1",
    [gazetteer.geometryRevision],
  );
  assert.equal(segments.rows[0]?.uncalibrated, true);
});
test("concurrent and stale imports retain the newer complete snapshot", async () => {
  const { gazetteer, geometry } = await fixture();
  const newerSource = structuredClone(gazetteer.source);
  newerSource.retrievedAt = "2026-10-17T22:45:00Z";
  const first = newerSource.landmarks[0];
  assert.ok(first);
  first.name = "Updated toll fixture";
  const newer = buildGazetteer(geometry.segments, newerSource);
  assert.ok(newer.ok);
  for (const result of await Promise.all([
    importPe22Gazetteer(pool, gazetteer),
    importPe22Gazetteer(pool, newer.value),
  ]))
    assert.ok(result.ok);
  const stale = await importPe22Gazetteer(pool, gazetteer);
  assert.ok(stale.ok);
  assert.equal(stale.value.stale, true);
  assert.equal(stale.value.changed, false);
  const rows = await pool.query<{ name: string }>(
    "select name from public.gazetteer where geometry_revision=$1 and source_id='5:1'",
    [gazetteer.geometryRevision],
  );
  assert.equal(rows.rows[0]?.name, "Updated toll fixture");
});
test("refresh removes withdrawn candidates only in the current provider and revision", async () => {
  const { gazetteer, geometry } = await fixture();
  assert.ok((await importPe22Gazetteer(pool, gazetteer)).ok);
  const legacy = await pool.query<{ id: string }>(
    "insert into public.gazetteer (road_code,name,location,source_url,retrieved_at,geometry_revision) values ('PE-22','Legacy fixture',extensions.st_setsrid(extensions.st_makepoint(0,0),4326),'https://example.test/legacy',now(),$1) returning id",
    [gazetteer.geometryRevision],
  );
  const input = structuredClone(gazetteer.source);
  input.retrievedAt = "2026-10-17T22:45:00Z";
  const bridge = input.landmarks[2];
  assert.ok(bridge);
  bridge.name = "S/N";
  const updated = buildGazetteer(geometry.segments, input);
  assert.ok(updated.ok);
  assert.ok((await importPe22Gazetteer(pool, updated.value)).ok);
  const rows = await pool.query<{ count: number }>(
    "select count(*)::integer as count from public.gazetteer where geometry_revision=$1",
    [gazetteer.geometryRevision],
  );
  assert.equal(rows.rows[0]?.count, 3);
  const stale = await importPe22Gazetteer(pool, gazetteer);
  assert.ok(stale.ok);
  assert.equal(stale.value.stale, true);
  assert.equal(stale.value.entryCount, 2);
  assert.equal(
    (await pool.query("select id from public.gazetteer where id=$1", [legacy.rows[0]?.id]))
      .rowCount,
    1,
  );
});
test("altered cache locations, missing coverage, and unknown revisions cannot partially persist", async () => {
  const { gazetteer } = await fixture();
  const first = gazetteer.entries[0];
  assert.ok(first);
  for (const input of [
    { ...gazetteer, geometryRevision: "f".repeat(64) },
    { ...gazetteer, entries: gazetteer.entries.slice(1) },
    {
      ...gazetteer,
      entries: [
        { ...first, location: { ...first.location, distanceFromOriginKm: 999 } },
        ...gazetteer.entries.slice(1),
      ],
    },
    {
      ...gazetteer,
      entries: [
        { ...first, location: { ...first.location, segmentId: "unknown" } },
        ...gazetteer.entries.slice(1),
      ],
    },
  ])
    assert.equal((await importPe22Gazetteer(pool, input)).ok, false);
  assert.equal(
    (
      await pool.query("select id from public.gazetteer where geometry_revision=$1", [
        gazetteer.geometryRevision,
      ])
    ).rowCount,
    0,
  );
  assert.equal(
    (
      await pool.query(
        "select provider from public.gazetteer_snapshots where geometry_revision=$1",
        [gazetteer.geometryRevision],
      )
    ).rowCount,
    0,
  );
  assert.ok((await importPe22Gazetteer(pool, gazetteer)).ok);
});
