import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { length } from "@turf/length";
import { test } from "vitest";
import { prepareRoadGeometry } from "../../src/services/prepare-road-geometry.ts";
import { capturedSnapshot, shortSnapshot } from "./support.ts";

test("captured PE-22 sections reproduce the committed corridor and display segments", () => {
  const snapshot = capturedSnapshot();
  const result = prepareRoadGeometry(snapshot);
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
  const result = prepareRoadGeometry(shortSnapshot());
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
  const result = prepareRoadGeometry(capturedSnapshot());
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
  const first = prepareRoadGeometry(original);
  const reordered = prepareRoadGeometry({
    ...original,
    retrievedAt: "2026-10-18T01:00:00.000Z",
    features: [...original.features].reverse(),
  });
  assert.deepEqual(first, reordered);
});

test("geometry edits produce a new revision and segment identities", () => {
  const source = shortSnapshot();
  const first = prepareRoadGeometry(source);
  const section = source.features[0];
  assert.ok(section);
  section.geometry = {
    type: "LineString",
    coordinates: [
      [-76.901, -12],
      [-76.89, -12],
    ],
  };
  const updated = prepareRoadGeometry(source);
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
  const duplicate = prepareRoadGeometry({ ...source, features: [first, first] });
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
  const disconnected = prepareRoadGeometry(broken);
  assert.ok(!disconnected.ok);
  assert.equal(disconnected.error.code, "disconnected_geometry");
  second.properties.sourceKmStart = 1.1;
  const gap = prepareRoadGeometry(source);
  assert.ok(!gap.ok);
  assert.equal(gap.error.code, "invalid_chainage");
});

test("invalid coordinates, reversed source ranges, and zero-length lines fail explicitly", () => {
  assert.equal(prepareRoadGeometry({ features: [] }).ok, false);
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
  const zero = prepareRoadGeometry({ ...source, features: [first] });
  assert.ok(!zero.ok);
  assert.equal(zero.error.code, "zero_length_geometry");
  first.geometry = {
    type: "LineString",
    coordinates: [
      [-76.9, -120],
      [-76.89, -12],
    ],
  };
  assert.equal(prepareRoadGeometry(source).ok, false);
  first.properties.sourceKmEnd = -1;
  assert.equal(prepareRoadGeometry(source).ok, false);
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
  assert.equal(prepareRoadGeometry(snapshot).ok, true);
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
  const disconnected = prepareRoadGeometry(snapshot);
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
  const result = prepareRoadGeometry({ ...snapshot, features: [section] });
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
  const result = prepareRoadGeometry({ ...snapshot, features: [section] });
  assert.ok(!result.ok);
  assert.equal(result.error.code, "too_many_segments");
});

test("a tiny section collapsed onto the previous end passes through; a longer one still fails", () => {
  const build = (collapsedKm: number) => {
    const [first, second] = shortSnapshot().features;
    assert.ok(first && second);
    const end = first.geometry.coordinates.at(-1);
    assert.ok(end && !Array.isArray(end[0]));
    // MTC publishes such sections on PE-3N (10–30 m whose two points are identical).
    const collapsed = structuredClone(first);
    collapsed.properties = {
      ...first.properties,
      sourceId: "PE-22#1#collapsed",
      sourceKmStart: 1,
      sourceKmEnd: 1 + collapsedKm,
      sourceLengthKm: collapsedKm,
    };
    collapsed.geometry = {
      type: "LineString",
      coordinates: [end as [number, number], end as [number, number]],
    };
    second.properties = {
      ...second.properties,
      sourceKmStart: 1 + collapsedKm,
      sourceKmEnd: 2 + collapsedKm,
    };
    return prepareRoadGeometry({ ...shortSnapshot(), features: [first, collapsed, second] });
  };
  const tiny = build(0.03);
  assert.ok(tiny.ok);
  assert.equal(tiny.value.diagnostics[1]?.measuredLengthKm, 0);
  assert.equal(tiny.value.segments.features.length, 3);
  const long = build(0.2);
  assert.ok(!long.ok);
  assert.equal(long.error.code, "zero_length_geometry");
});
