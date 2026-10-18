import { exposurePolicySchema } from "../../contracts/exposure.ts";
// Initial engineering attention bins; these are not SENAMHI or calibrated hazard cutoffs.
export const DEFAULT_EXPOSURE_POLICY = exposurePolicySchema.parse({
  version: "climate-exposure-v1",
  interpretation: "experimental_attention_criteria_not_hazard_thresholds",
  weatherMaxAgeMs: 90 * 60 * 1000,
  minimumSusceptibilityCoverage: 0.9,
  susceptibleAreaFraction: 0.2,
  antecedentRainMm72h: 30,
  antecedentRainMm168h: 70,
  thresholds: { "6": [1, 5, 10], "24": [4, 20, 40], "72": [12, 60, 120] },
});
