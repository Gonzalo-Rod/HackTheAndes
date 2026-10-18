import { exposurePolicySchema } from "../../contracts/exposure.ts";
// Initial engineering attention bins; these are not SENAMHI or calibrated hazard cutoffs.
// v2 escalates a segment only where the road crosses INGEMMET class 4 (high) or 5 (very high)
// terrain: catchment-wide fractions exceeded 0.2 everywhere on PE-22 and never discriminated.
export const DEFAULT_EXPOSURE_POLICY = exposurePolicySchema.parse({
  version: "climate-exposure-v2",
  minimumLocalSusceptibilityClass: 4,
  interpretation: "experimental_attention_criteria_not_hazard_thresholds",
  weatherMaxAgeMs: 90 * 60 * 1000,
  minimumSusceptibilityCoverage: 0.9,
  susceptibleAreaFraction: 0.2,
  antecedentRainMm72h: 30,
  antecedentRainMm168h: 70,
  thresholds: { "6": [1, 5, 10], "24": [4, 20, 40], "72": [12, 60, 120] },
});
