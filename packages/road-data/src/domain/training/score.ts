import {
  FEATURE_NAMES,
  featureValuesSchema,
  logisticArtifactSchema,
} from "../../contracts/logistic-training.ts";
/** Portable evaluation of the exported pipeline; this never assigns an operational warning level. */
export function scoreLogistic(input: unknown, featuresInput: unknown, horizonHours: 6 | 24 | 72) {
  const parsedModel = logisticArtifactSchema.safeParse(input);
  if (!parsedModel.success) return { ok: false as const, error: "invalid_model" as const };
  const parsedFeatures = featureValuesSchema.safeParse(featuresInput);
  if (!parsedFeatures.success) return { ok: false as const, error: "invalid_features" as const };
  const model = parsedModel.data,
    features = parsedFeatures.data;
  if (model.horizonHours !== horizonHours)
    return { ok: false as const, error: "unsupported_horizon" as const };
  let logit = model.intercept;
  for (const [index, name] of FEATURE_NAMES.entries()) {
    const mean = model.means[index],
      scale = model.scales[index],
      coefficient = model.coefficients[index];
    if (mean === undefined || scale === undefined || coefficient === undefined)
      throw new Error("Invalid model dimensions");
    logit += ((Math.log1p(features[name]) - mean) / scale) * coefficient;
  }
  if (!Number.isFinite(logit))
    return { ok: false as const, error: "invalid_numeric_state" as const };
  // This form avoids overflow for either sign, including extreme valid numeric inputs.
  const score = logit >= 0 ? 1 / (1 + Math.exp(-logit)) : Math.exp(logit) / (1 + Math.exp(logit));
  return {
    ok: true as const,
    score,
    probabilitiesCalibrated: false as const,
    status: "experimental" as const,
  };
}
