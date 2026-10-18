import { beforeAll, expect, it } from "vitest";
import { capturedExposure } from "./support.ts";
import { prepareExposure } from "../../src/services/prepare-exposure.ts";
import {
  validateExposureRecord,
  exposureIdentity,
  exposureHash,
} from "../../src/domain/exposure/record.ts";
import { calculateExposure } from "../../src/domain/exposure/assessment.ts";
import { createExposureView } from "../../src/domain/exposure/view.ts";
import { exposurePolicySchema } from "../../src/contracts/exposure.ts";
let fixture: Awaited<ReturnType<typeof capturedExposure>>;
beforeAll(async () => {
  fixture = await capturedExposure();
});
it("builds all captured segments and catchments with traceable unknown links", () => {
  const a = fixture.record.assessment;
  // River crossings plus containing basins link every captured PE-22 segment.
  expect(a.catchments).toHaveLength(13);
  expect(a.segments).toHaveLength(174);
  expect(a.segments.filter((s) => s.catchmentIds.length > 0)).toHaveLength(174);
  expect(
    a.segments
      .filter((s) => !s.catchmentIds.length)
      .every((s) => s.windows.next24h.category === null),
  ).toBe(true);
  expect(a.automatedAlertUse).toBe(false);
  expect(a.officialAdvisories.automatedAssessmentUse).toBe(false);
  expect(a.catchments.every((c) => c.windows.sixHourly.length === 12)).toBe(true);
  expect(validateExposureRecord(fixture.record)).toEqual(fixture.record);
});
it("has a deterministic input/policy identity independent of repeated operator execution", () => {
  const again = prepareExposure(
    fixture.sources,
    new Date(Date.parse(fixture.at) + 1000).toISOString(),
  );
  expect(again.ok).toBe(true);
  if (!again.ok) return;
  expect(again.value.assessment.assessmentId).toBe(fixture.record.assessment.assessmentId);
  expect(again.value.assessment.assessedAt).not.toBe(fixture.record.assessment.assessedAt);
});
it("rejects mismatched revisions, malformed sources and future captures", () => {
  expect(prepareExposure({ ...fixture.sources, weather: {} }, fixture.at)).toMatchObject({
    ok: false,
    error: { code: "invalid_inputs" },
  });
  expect(
    prepareExposure(
      {
        ...fixture.sources,
        weather: { ...fixture.sources.weather, geometryRevision: "a".repeat(64) },
      },
      fixture.at,
    ),
  ).toMatchObject({ ok: false, error: { code: "revision_mismatch" } });
  expect(prepareExposure(fixture.sources, "2020-01-01T00:00:00Z")).toMatchObject({
    ok: false,
    error: { code: "inconsistent_inputs" },
  });
  expect(
    prepareExposure(
      {
        ...fixture.sources,
        weather: { ...fixture.sources.weather, kind: "reanalysis", model: "era5" },
      },
      fixture.at,
    ),
  ).toMatchObject({ ok: false });
});
it("rejects cross-revision segment links and invalid policy thresholds", () => {
  const sources = structuredClone(fixture.sources);
  const first = sources.segments.features[0];
  if (!first) throw new Error("Missing fixture segment");
  first.properties.geometryRevision = "b".repeat(64);
  expect(prepareExposure(sources, fixture.at)).toMatchObject({ ok: false });
  expect(
    exposurePolicySchema.safeParse({
      ...fixture.record.assessment.policy,
      thresholds: { "6": [2, 1, 3], "24": [4, 20, 40], "72": [12, 60, 120] },
    }).success,
  ).toBe(false);
});
it("masks stale and future evaluations without moving original forecast windows", () => {
  const a = fixture.record.assessment;
  const from = Date.parse(a.sources.weatherCapturedAt);
  const stale = createExposureView(a, from + a.policy.weatherMaxAgeMs, "snapshot");
  expect(stale.meta.state).toBe("stale");
  expect(stale.meta.operationallyUsable).toBe(false);
  expect(stale.data.anchorAt).toBe(a.anchorAt);
  expect(stale.data.segments.every((s) => s.windows.next24h.category === null)).toBe(true);
  expect(stale.data.catchments[0]?.windows.next24h.reasons).toEqual(["stale_weather"]);
  expect(createExposureView(a, from - 1, "database").meta.state).toBe("unavailable");
});
it("rejects modified categories or input records even when their shapes remain valid", () => {
  const changed = structuredClone(fixture.record);
  const first = changed.assessment.catchments[0];
  if (!first) throw new Error("Missing fixture catchment");
  first.highSusceptibilityFraction = first.highSusceptibilityFraction === 0 ? 1 : 0;
  expect(() => validateExposureRecord(changed)).toThrow("reproduce");
  const input = structuredClone(fixture.record.input);
  input.sourceHashes.hazards = "c".repeat(64);
  expect(exposureIdentity(input, fixture.record.assessment.policy)).not.toBe(
    fixture.record.assessment.assessmentId,
  );
});
it("treats an incomplete forecast and missing susceptibility as unknown instead of dry/safe", () => {
  const input = structuredClone(fixture.record.input);
  input.susceptibility = [];
  const policy = fixture.record.assessment.policy;
  const a = calculateExposure(input, policy, {
    assessmentId: exposureIdentity(input, policy),
    policySha256: exposureHash(policy),
    assessedAt: fixture.at,
  });
  expect(a.catchments.every((c) => c.windows.next24h.category === null)).toBe(true);
  expect(a.catchments[0]?.windows.next24h.reasons).toContain("missing_susceptibility");
});
it("keeps susceptibility fractions within [0, 1] when sample weights overshoot by rounding", () => {
  const input = structuredClone(fixture.record.input);
  const first = input.susceptibility[0];
  if (!first) throw new Error("Fixture needs susceptibility");
  // Observed on PE-3N: class weights summing to 1.0000000000000002.
  first.classWeights = { "1": 0, "2": 0, "3": 0, "4": 0.1741456795546789, "5": 0.8258543204453213 };
  first.unknownWeight = 0;
  const policy = exposurePolicySchema.parse(fixture.record.assessment.policy);
  const assessment = calculateExposure(input, policy, {
    assessmentId: exposureIdentity(input, policy),
    policySha256: exposureHash(policy),
    assessedAt: fixture.at,
  });
  const catchment = assessment.catchments.find((c) => c.catchmentId === first.catchmentId);
  expect(catchment?.highSusceptibilityFraction).toBe(1);
  expect(catchment?.susceptibilityCoverageFraction).toBe(1);
});
