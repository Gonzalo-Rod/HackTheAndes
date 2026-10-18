import { expect, it } from "vitest";
import { scoreLogistic } from "../../src/domain/training/score.ts";
import { FEATURE_NAMES, type LogisticArtifact } from "../../src/contracts/logistic-training.ts";
import { observation } from "./support.ts";
const model: LogisticArtifact = {
  schemaVersion: 1,
  algorithm: "l2_logistic_regression",
  target: "rainfall_related_road_disruption_onset",
  status: "experimental",
  probabilitiesCalibrated: false,
  createdAt: "2026-10-18T00:00:00Z",
  geometryRevision: "a".repeat(64),
  datasetSha256: "b".repeat(64),
  policySha256: "c".repeat(64),
  horizonHours: 24,
  featureNames: [...FEATURE_NAMES],
  transform: "log1p_then_standard_scaler",
  means: [Math.log(2), 0, 0, 0, 0],
  scales: [1, 1, 1, 1, 1],
  coefficients: [1, 0, 0, 0, 0],
  intercept: 0,
  binaryThreshold: 0.5,
  baselineRainThresholdMm: 20,
  regularizationC: 0.1,
  trainingLibrary: "synthetic fixture only",
};
it("reproduces an analytically known transformed logistic score without implying calibrated probability", () => {
  const result = scoreLogistic(model, { ...observation().features, forecastRainMm: 3 }, 24);
  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.score).toBeCloseTo(2 / 3, 14);
    expect(result.probabilitiesCalibrated).toBe(false);
  }
  expect(scoreLogistic(model, observation().features, 72)).toEqual({
    ok: false,
    error: "unsupported_horizon",
  });
});
it("handles extreme logits and rejects malformed vectors, missing features and arithmetic overflow", () => {
  const extreme = scoreLogistic({ ...model, intercept: -1000 }, observation().features, 24);
  expect(extreme.ok && extreme.score).toBe(0);
  expect(scoreLogistic({ ...model, scales: [0, 1, 1, 1, 1] }, observation().features, 24)).toEqual({
    ok: false,
    error: "invalid_model",
  });
  expect(scoreLogistic(model, { ...observation().features, forecastRainMm: null }, 24)).toEqual({
    ok: false,
    error: "invalid_features",
  });
  expect(
    scoreLogistic(
      { ...model, coefficients: [1e308, 0, 0, 0, 0] },
      { ...observation().features, forecastRainMm: 1e308 },
      24,
    ),
  ).toEqual({ ok: false, error: "invalid_numeric_state" });
});
