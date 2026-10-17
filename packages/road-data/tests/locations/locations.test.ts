import assert from "node:assert/strict";
import { test } from "vitest";
import { createRoadLocator } from "../../src/domain/road-data/locate-road-position.ts";
import {
  buildGazetteer,
  normalizePlaceName,
  resolvePlaceName,
} from "../../src/domain/road-data/build-gazetteer.ts";
import {
  validateGazetteerSnapshot,
  preparePe22Gazetteer,
} from "../../src/services/prepare-pe22-gazetteer.ts";
import { preparePe22Geometry } from "../../src/services/prepare-pe22.ts";
import { capturedSnapshot } from "../geometry/support.ts";
import { geometry, source, capturedGazetteer } from "./support.ts";

test("invalid geometry never calls the landmark provider", async () => {
  let called = false;
  const result = await preparePe22Gazetteer({
    segments: null,
    provider: {
      fetchLandmarks: async () => {
        called = true;
        return source();
      },
    },
  });
  assert.equal(result.ok, false);
  assert.equal(called, false);
});

test("an entirely displaced source cannot silently withdraw every cached candidate", () => {
  const input = source();
  input.landmarks = input.landmarks.map((row) => ({ ...row, position: [0, 0] }));
  assert.equal(buildGazetteer(geometry().segments, input).ok, false);
});

test("pins outside PE-22 or beyond 500 m are rejected; nearby pins retain their original offset", () => {
  const locator = createRoadLocator(geometry().segments);
  assert.ok(locator.ok);
  for (const position of [
    [-77.03, -12.04],
    [-76.89, -11.99549],
  ]) {
    const result = locator.value.locate(position);
    assert.ok(!result.ok);
    assert.equal(result.error.code, "outside_corridor");
  }
  const inside = locator.value.locate([-76.89, -11.99551]);
  assert.ok(inside.ok);
  assert.ok(inside.value.distanceFromRoadM > 499 && inside.value.distanceFromRoadM < 500);
  assert.ok(inside.value.distanceFromOriginKm > 0);
  for (const position of [null, [181, -12], [0], [-76, NaN]])
    assert.equal(locator.value.locate(position).ok, false);
});
test("shared endpoints belong to the next segment and the last endpoint remains locatable", () => {
  const segments = geometry().segments;
  const first = segments.features[0];
  const last = segments.features.at(-1);
  assert.ok(first && last);
  const locator = createRoadLocator(segments);
  assert.ok(locator.ok);
  const boundary = locator.value.locate(first.geometry.coordinates.at(-1));
  assert.ok(boundary.ok);
  assert.equal(boundary.value.segmentId, segments.features[1]?.id);
  const end = locator.value.locate(last.geometry.coordinates.at(-1));
  assert.ok(end.ok);
  assert.equal(end.value.segmentId, last.id);
});
test.each(["empty", "mixed", "duplicate", "zero", "gap", "disconnected"])(
  "invalid %s road geometry is an expected failure",
  (kind) => {
    const input = geometry().segments;
    const first = input.features[0];
    const second = input.features[1];
    assert.ok(first && second);
    if (kind === "empty") input.features = [];
    if (kind === "mixed") second.properties.geometryRevision = "f".repeat(64);
    if (kind === "duplicate") second.id = first.id;
    if (kind === "zero")
      first.geometry.coordinates = [
        [-76.9, -12],
        [-76.9, -12],
      ];
    if (kind === "gap") second.properties.distanceFromOriginStartKm += 0.1;
    if (kind === "disconnected") second.geometry.coordinates[0] = [0, 0];
    assert.equal(createRoadLocator(input).ok, false);
  },
);
test("gazetteer keeps source kilometers unverified and uses only explicit PE-22 records as kilometer evidence", () => {
  const result = buildGazetteer(geometry().segments, source());
  assert.ok(result.ok);
  assert.equal(result.value.entries.length, 3);
  assert.equal(result.value.kilometerEvidence.anchors.length, 2);
  assert.ok(result.value.entries.every((entry) => entry.officialKm === null && !entry.verified));
  const bridge = result.value.entries.find((entry) => entry.kind === "bridge");
  assert.equal(bridge?.reportedRoadCode, null);
});
test("unnamed and off-corridor records are explicitly excluded, never moved onto the road", () => {
  const input = source();
  const bridge = input.landmarks[2];
  assert.ok(bridge);
  input.landmarks.push(
    { ...bridge, sourceId: "7:4", name: "S/N" },
    { ...bridge, sourceId: "7:5", position: [0, 0] },
  );
  const result = buildGazetteer(geometry().segments, input);
  assert.ok(result.ok);
  assert.deepEqual(
    result.value.excluded.map((row) => row.reason),
    ["unnamed", "outside_corridor"],
  );
  const first = input.landmarks[0];
  assert.ok(first);
  input.landmarks.push(first);
  assert.equal(buildGazetteer(geometry().segments, input).ok, false);
});
test("accent/case normalization and aliases resolve exactly; duplicate names remain ambiguous", () => {
  assert.equal(normalizePlaceName("  Puente RÍO-BLANCO  "), "puente rio blanco");
  const result = buildGazetteer(geometry().segments, source());
  assert.ok(result.ok);
  const match = resolvePlaceName(result.value, "puente rio blanco");
  assert.equal(match.status, "matched");
  assert.equal(match.requiresConfirmation, true);
  assert.equal(resolvePlaceName(result.value, "pasando el puente").status, "not_found");
  assert.equal(resolvePlaceName(result.value, "").status, "not_found");
  assert.equal(resolvePlaceName(null, "corcona").status, "unavailable");
  const input = source();
  const bridge = input.landmarks[2];
  assert.ok(bridge);
  input.landmarks.push({ ...bridge, sourceId: "7:4", position: [-76.881, -12] });
  const ambiguous = buildGazetteer(geometry().segments, input);
  assert.ok(ambiguous.ok);
  assert.equal(resolvePlaceName(ambiguous.value, "rio blanco").status, "ambiguous");
});
test("committed data reproduces offline; changed identities, locations and revisions cannot pass cache verification", () => {
  const built = preparePe22Geometry(capturedSnapshot());
  assert.ok(built.ok);
  const captured = capturedGazetteer();
  assert.ok(validateGazetteerSnapshot(built.value.segments, captured).ok);
  const first = captured.entries[0];
  assert.ok(first);
  for (const input of [
    null,
    { ...captured, geometryRevision: "f".repeat(64) },
    { ...captured, entries: captured.entries.slice(1) },
    { ...captured, entries: [{ ...first, position: [0, 0] }, ...captured.entries.slice(1)] },
  ])
    assert.equal(validateGazetteerSnapshot(built.value.segments, input).ok, false);
});

test("cache reproduction allows only millimeter numerical noise in derived fields, keeping source facts exact", () => {
  const segments = geometry().segments;
  const built = buildGazetteer(segments, source());
  assert.ok(built.ok);
  const noisy = structuredClone(built.value);
  const entry = noisy.entries[0];
  const anchor = noisy.kilometerEvidence.anchors[0];
  assert.ok(entry && anchor);
  entry.location.distanceFromRoadM += 0.0001;
  entry.location.distanceFromOriginKm += 1e-7;
  entry.location.snappedPosition[0] += 1e-9;
  anchor.distanceFromOriginKm += 1e-7;
  anchor.offsetKm -= 1e-7;
  const accepted = validateGazetteerSnapshot(segments, noisy);
  assert.ok(accepted.ok);
  assert.deepEqual(accepted.value, noisy);
  for (const field of ["distance", "coordinate", "source", "name", "segment", "anchor"]) {
    const changed = structuredClone(noisy);
    const first = changed.entries[0];
    assert.ok(first);
    if (field === "distance") first.location.distanceFromRoadM += 0.01;
    if (field === "coordinate") first.location.snappedPosition[0] += 1e-6;
    if (field === "source") first.reportedKm = 999;
    if (field === "name") first.name += " changed";
    if (field === "segment") first.location.segmentId = "other";
    if (field === "anchor") {
      const item = changed.kilometerEvidence.anchors[0];
      assert.ok(item);
      item.offsetKm += 0.01;
    }
    assert.equal(validateGazetteerSnapshot(segments, changed).ok, false, field);
  }
});
