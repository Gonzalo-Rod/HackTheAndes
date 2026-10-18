import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "vitest";
import { prepareRoadGeometry } from "../../src/services/prepare-road-geometry.ts";
import {
  planElevationSamples,
  validateElevationSnapshot,
} from "../../src/domain/road-data/elevation-samples.ts";
import { preparePe22Elevation } from "../../src/services/prepare-pe22-elevation.ts";
import {
  elevationSnapshotSchema,
  type ElevationProvider,
} from "../../src/contracts/road-elevation.ts";
import { shortSnapshot, capturedSnapshot } from "../geometry/support.ts";

function segments() {
  const result = prepareRoadGeometry(shortSnapshot());
  assert.ok(result.ok);
  return result.value.segments;
}
const provider: ElevationProvider = {
  source: {
    provider: "fixture",
    dataset: "test-dem",
    spatialResolutionM: 90,
    attribution: "Synthetic test only",
    documentationUrl: "https://example.test/dem",
  },
  fetchElevations: async (points) => ({
    values: points.map((_, index) => 100 + index),
    sourceUrls: ["https://example.test/elevation"],
  }),
};

test("samples follow curved geometry instead of averaging its endpoints", () => {
  const input = segments();
  const first = input.features[0];
  assert.ok(first);
  first.geometry.coordinates = [
    [-76.9, -12],
    [-76.9, -11.99],
    [-76.89, -11.99],
  ];
  const result = planElevationSamples(input);
  assert.ok(result.ok);
  const point = result.value.samples[0];
  assert.ok(point);
  assert.ok(Math.abs(point.position[0] + 76.9) < 0.001);
  assert.ok(Math.abs(point.position[1] + 11.99) < 0.001);
  assert.equal(point.distanceFromOriginKm, 0.5);
});

test("the captured corridor produces one midpoint per segment without changing the base contract", () => {
  const geometry = prepareRoadGeometry(capturedSnapshot());
  assert.ok(geometry.ok);
  const before = JSON.stringify(geometry.value.segments);
  const plan = planElevationSamples(geometry.value.segments);
  assert.ok(plan.ok);
  assert.equal(plan.value.samples.length, 174);
  assert.equal(plan.value.geometryRevision, geometry.value.corridor.properties.geometryRevision);
  assert.equal(JSON.stringify(geometry.value.segments), before);
  assert.ok(
    geometry.value.segments.features.every(
      (segment) =>
        segment.properties.officialKmStart === null && segment.properties.elevationM === null,
    ),
  );
});

test.each(["mixed", "duplicate", "zero", "reversed-distance"])(
  "rejects %s segments before requesting elevation",
  async (kind) => {
    const input = segments();
    const first = input.features[0];
    const second = input.features[1];
    assert.ok(first && second);
    if (kind === "mixed") second.properties.geometryRevision = "f".repeat(64);
    if (kind === "duplicate") second.id = first.id;
    if (kind === "zero")
      first.geometry.coordinates = [
        [-76.9, -12],
        [-76.9, -12],
      ];
    if (kind === "reversed-distance")
      first.properties.distanceFromOriginStartKm = first.properties.distanceFromOriginEndKm + 1;
    let called = false;
    const result = await preparePe22Elevation({
      segments: input,
      provider: {
        ...provider,
        fetchElevations: async () => {
          called = true;
          throw new Error("Must not call provider");
        },
      },
    });
    assert.equal(result.ok, false);
    assert.equal(called, false);
  },
);

test.each([null, { type: "FeatureCollection", features: [] }])(
  "rejects malformed or empty segment input",
  (input) => {
    assert.equal(planElevationSamples(input).ok, false);
  },
);

test("the service preserves source, sample identity, timestamp and request cancellation", async () => {
  const signal = new AbortController().signal;
  const input = segments();
  const result = await preparePe22Elevation({
    segments: input,
    requestId: "elevation-check",
    signal,
    clock: () => new Date("2026-10-17T21:00:00Z"),
    provider: {
      ...provider,
      fetchElevations: async (positions, options) => {
        assert.equal(options?.requestId, "elevation-check");
        assert.equal(options.signal, signal);
        return provider.fetchElevations(positions);
      },
    },
  });
  assert.ok(result.ok);
  assert.equal(result.value.retrievedAt, "2026-10-17T21:00:00.000Z");
  assert.deepEqual(result.value.source, provider.source);
  assert.equal(result.value.samples[0]?.segmentId, input.features[0]?.id);
  assert.equal(result.value.samples[0]?.elevationM, 100);
  assert.equal(result.value.samplingMethod, "segment_midpoint");
  const duplicate = {
    ...result.value,
    samples: [result.value.samples[0], result.value.samples[0]],
  };
  assert.equal(elevationSnapshotSchema.safeParse(duplicate).success, false);
});

test("unavailable or misaligned providers cannot produce a confirmed snapshot", async () => {
  await assert.rejects(
    preparePe22Elevation({
      segments: segments(),
      provider: {
        ...provider,
        fetchElevations: async () => {
          throw new Error("Provider unavailable");
        },
      },
    }),
    /Provider unavailable/,
  );
  await assert.rejects(
    preparePe22Elevation({
      segments: segments(),
      provider: {
        ...provider,
        fetchElevations: async () => ({
          values: [10],
          sourceUrls: ["https://example.test/elevation"],
        }),
      },
    }),
    /one value per sample/,
  );
});

test("the captured elevation cache matches the current road revision and sampling plan", () => {
  const geometry = prepareRoadGeometry(capturedSnapshot());
  assert.ok(geometry.ok);
  const plan = planElevationSamples(geometry.value.segments);
  assert.ok(plan.ok);
  const input: unknown = JSON.parse(
    readFileSync(new URL("../../data/pe22/elevation.json", import.meta.url), "utf8"),
  );
  const verified = validateElevationSnapshot(input, plan.value);
  assert.ok(verified.ok);
  assert.equal(verified.value.samples.length, 174);
  assert.equal(verified.value.source.spatialResolutionM, 90);
});

test("incompatible cached coverage and misplaced samples cannot be presented as verified elevation", async () => {
  const input = segments();
  const plan = planElevationSamples(input);
  const prepared = await preparePe22Elevation({ segments: input, provider });
  assert.ok(plan.ok && prepared.ok);
  for (const snapshot of [
    null,
    { ...prepared.value, geometryRevision: "f".repeat(64) },
    { ...prepared.value, samples: prepared.value.samples.slice(1) },
    {
      ...prepared.value,
      samples: prepared.value.samples.map((sample) => ({ ...sample, position: [0, 0] })),
    },
  ])
    assert.equal(validateElevationSnapshot(snapshot, plan.value).ok, false);
});
