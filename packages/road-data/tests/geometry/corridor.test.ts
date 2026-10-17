import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { length } from "@turf/length";
import { test } from "vitest";
import { preparePe22Geometry } from "../../src/services/prepare-pe22.ts";
import { capturedSnapshot, shortSnapshot } from "./support.ts";

test("captured PE-22 sections reproduce the committed corridor and display segments", () => {
  const snapshot = capturedSnapshot();
  const result = preparePe22Geometry(snapshot);
  assert.ok(result.ok);
  assert.equal(snapshot.features.length, 32);
  assert.equal(result.value.segments.features.length, 174);
  assert.ok(Math.abs(result.value.corridor.properties.measuredLengthKm - 173.8727227) < 1e-6);
  for (const [name, value] of [
    ["corridor.geojson", result.value.corridor],
    ["segments-1km.geojson", result.value.segments],
  ] as const) {
    const committed: unknown = JSON.parse(
      readFileSync(new URL(`../../data/pe22/${name}`, import.meta.url), "utf8"),
    );
    assert.deepEqual(value, committed);
  }
});

test("segments preserve endpoints, continuous geometry, and measured length with a final remainder", () => {
  const result = preparePe22Geometry(shortSnapshot());
  assert.ok(result.ok);
  const { segments, corridor } = result.value;
  assert.equal(segments.features.length, 3);
  assert.deepEqual(segments.features[0]?.geometry.coordinates[0], corridor.geometry.coordinates[0]);
  assert.deepEqual(
    segments.features.at(-1)?.geometry.coordinates.at(-1),
    corridor.geometry.coordinates.at(-1),
  );
  let sum = 0;
  for (const [index, segment] of segments.features.entries()) {
    const measured = length(segment, { units: "kilometers" });
    assert.ok(Math.abs(measured - segment.properties.lengthKm) < 1e-8);
    assert.ok(segment.properties.lengthKm <= 1);
    sum += measured;
    if (index > 0)
      assert.deepEqual(
        segments.features[index - 1]?.geometry.coordinates.at(-1),
        segment.geometry.coordinates[0],
      );
  }
  assert.ok(Math.abs(sum - corridor.properties.measuredLengthKm) < 1e-8);
});

test("measured kilometers never masquerade as calibrated official kilometer markers or elevations", () => {
  const result = preparePe22Geometry(capturedSnapshot());
  assert.ok(result.ok);
  assert.ok(result.value.diagnostics.some((item) => Math.abs(item.lengthDifferenceKm) > 1));
  for (const segment of result.value.segments.features) {
    assert.equal(segment.properties.kilometerCalibration, "unverified");
    assert.equal(segment.properties.officialKmStart, null);
    assert.equal(segment.properties.officialKmEnd, null);
    assert.equal(segment.properties.elevationM, null);
    assert.ok(segment.properties.sourceReferences.length > 0);
  }
});

test("source ordering and observation time do not change geometry IDs", () => {
  const original = shortSnapshot();
  const first = preparePe22Geometry(original);
  const reordered = preparePe22Geometry({
    ...original,
    retrievedAt: "2026-10-18T01:00:00.000Z",
    features: [...original.features].reverse(),
  });
  assert.deepEqual(first, reordered);
});

test("geometry edits produce a new revision and segment identities", () => {
  const source = shortSnapshot();
  const first = preparePe22Geometry(source);
  const section = source.features[0];
  assert.ok(section);
  section.geometry = {
    type: "LineString",
    coordinates: [
      [-76.901, -12],
      [-76.89, -12],
    ],
  };
  const updated = preparePe22Geometry(source);
  assert.ok(first.ok && updated.ok);
  assert.notEqual(
    first.value.corridor.properties.geometryRevision,
    updated.value.corridor.properties.geometryRevision,
  );
});

test("duplicate sections, missing joins, and chainage gaps are rejected", () => {
  const source = shortSnapshot();
  const first = source.features[0];
  const second = source.features[1];
  assert.ok(first && second);
  const duplicate = preparePe22Geometry({ ...source, features: [first, first] });
  assert.ok(!duplicate.ok);
  assert.equal(duplicate.error.code, "duplicate_section");
  const broken = structuredClone(source);
  const last = broken.features[1];
  assert.ok(last);
  last.geometry = {
    type: "LineString",
    coordinates: [
      [-76.885, -12],
      [-76.88, -12],
    ],
  };
  const disconnected = preparePe22Geometry(broken);
  assert.ok(!disconnected.ok);
  assert.equal(disconnected.error.code, "disconnected_geometry");
  second.properties.sourceKmStart = 1.1;
  const gap = preparePe22Geometry(source);
  assert.ok(!gap.ok);
  assert.equal(gap.error.code, "invalid_chainage");
});

test("invalid coordinates, reversed source ranges, and zero-length lines fail explicitly", () => {
  assert.equal(preparePe22Geometry({ features: [] }).ok, false);
  const source = shortSnapshot();
  const first = source.features[0];
  assert.ok(first);
  first.geometry = {
    type: "LineString",
    coordinates: [
      [-76.9, -12],
      [-76.9, -12],
    ],
  };
  const zero = preparePe22Geometry({ ...source, features: [first] });
  assert.ok(!zero.ok);
  assert.equal(zero.error.code, "zero_length_geometry");
  first.geometry = {
    type: "LineString",
    coordinates: [
      [-76.9, -120],
      [-76.89, -12],
    ],
  };
  assert.equal(preparePe22Geometry(source).ok, false);
  first.properties.sourceKmEnd = -1;
  assert.equal(preparePe22Geometry(source).ok, false);
});

test("the committed manifest detects modified or partially generated artifacts", () => {
  const manifest = JSON.parse(
    readFileSync(new URL("../../data/pe22/manifest.json", import.meta.url), "utf8"),
  ) as { files: Record<string, string> };
  for (const [name, expected] of Object.entries(manifest.files)) {
    const actual = createHash("sha256")
      .update(readFileSync(new URL(`../../data/pe22/${name}`, import.meta.url)))
      .digest("hex");
    assert.equal(actual, expected, name);
  }
});

test("connected multiline parts join without synthetic edges and disconnected parts fail", () => {
  const snapshot = shortSnapshot();
  const first = snapshot.features[0];
  assert.ok(first);
  first.geometry = {
    type: "MultiLineString",
    coordinates: [
      [
        [-76.9, -12],
        [-76.895, -12],
      ],
      [
        [-76.895, -12],
        [-76.89, -12],
      ],
    ],
  };
  assert.equal(preparePe22Geometry(snapshot).ok, true);
  first.geometry.coordinates = [
    [
      [-76.9, -12],
      [-76.895, -12],
    ],
    [
      [-76.894, -12],
      [-76.89, -12],
    ],
  ];
  const disconnected = preparePe22Geometry(snapshot);
  assert.ok(!disconnected.ok);
  assert.equal(disconnected.error.code, "disconnected_geometry");
});

test("an exact one-kilometer route does not emit a floating-point remainder segment", () => {
  const snapshot = shortSnapshot();
  const section = snapshot.features[0];
  assert.ok(section);
  // Turf's documented mean Earth radius converts one equatorial kilometer to longitude degrees.
  const oneKmDegrees = 180 / (Math.PI * 6371.0088);
  section.geometry = {
    type: "LineString",
    coordinates: [
      [0, 0],
      [oneKmDegrees, 0],
    ],
  };
  const result = preparePe22Geometry({ ...snapshot, features: [section] });
  assert.ok(result.ok);
  assert.equal(result.value.segments.features.length, 1);
});

test("an unexpectedly huge line is rejected before allocating display segments", () => {
  const snapshot = shortSnapshot();
  const section = snapshot.features[0];
  assert.ok(section);
  section.geometry = {
    type: "LineString",
    coordinates: [
      [-170, 0],
      [0, 0],
    ],
  };
  const result = preparePe22Geometry({ ...snapshot, features: [section] });
  assert.ok(!result.ok);
  assert.equal(result.error.code, "too_many_segments");
});
