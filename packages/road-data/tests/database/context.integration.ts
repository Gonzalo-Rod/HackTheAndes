import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "vitest";
import { createDatabasePool } from "../../src/db/pool.ts";
import { loadDatabaseConfiguration } from "../../src/config/env.ts";
import { createPostgresRoadContextRepository } from "../../src/db/road-context.ts";
import { persistPe22Geometry } from "../../src/db/import-geometry.ts";
import { preparePe22Geometry } from "../../src/services/prepare-pe22.ts";
import { importPe22Gazetteer } from "../../src/services/import-pe22-gazetteer.ts";
import { buildGazetteer } from "../../src/domain/road-data/build-gazetteer.ts";
import { createRoadContextService } from "../../src/services/road-context.ts";
import { officialContextArchiveSchema } from "../../src/contracts/road-context.ts";
import { shortSnapshot } from "../geometry/support.ts";
import { source } from "../locations/support.ts";

test("read context uses its explicit revision and validates real Postgres JSON and poll metadata", async () => {
  const pool = createDatabasePool(loadDatabaseConfiguration());
  const road = shortSnapshot();
  const shift = (randomBytes(4).readUInt32BE() / 2 ** 32) * 0.01;
  for (const feature of road.features) {
    if (feature.geometry.type !== "LineString") throw new Error("Unexpected fixture geometry");
    feature.geometry.coordinates = feature.geometry.coordinates.map(([lon, lat]) => [
      lon,
      lat + shift,
    ]);
  }
  const geometry = preparePe22Geometry(road);
  assert.ok(geometry.ok);
  const revision = geometry.value.corridor.properties.geometryRevision;
  try {
    await persistPe22Geometry(pool, road, geometry.value);
    const input = source();
    input.landmarks = input.landmarks.map((row) => ({
      ...row,
      position: [row.position[0], row.position[1] + shift],
    }));
    const gazetteer = buildGazetteer(geometry.value.segments, input);
    assert.ok(gazetteer.ok);
    assert.ok((await importPe22Gazetteer(pool, gazetteer.value)).ok);
    const repository = createPostgresRoadContextRepository(pool, revision);
    const context = createRoadContextService({ repository, logger: () => undefined });
    const result = await context.execute({ kind: "place", name: "corcona" }, "context-db-test");
    assert.ok(result.kind === "location" && result.location);
    assert.equal(result.location.geometryRevision, revision);
    assert.equal(result.status, "matched");
    officialContextArchiveSchema.parse(await repository.readOfficial());
    const missing = createPostgresRoadContextRepository(pool, "f".repeat(64));
    await assert.rejects(missing.readSpatial(), /No spatial context/);
  } finally {
    try {
      await pool.query("delete from public.gazetteer where geometry_revision=$1", [revision]);
      await pool.query("delete from public.gazetteer_snapshots where geometry_revision=$1", [
        revision,
      ]);
      await pool.query("delete from public.segments where geometry_revision=$1", [revision]);
      await pool.query("delete from public.geometry_revisions where id=$1", [revision]);
    } finally {
      await pool.end();
    }
  }
});
