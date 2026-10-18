import { expect, it } from "vitest";
import { readWeatherFile } from "../../src/integrations/open-meteo/weather-files.ts";
import { readBundledTerrain } from "../../src/integrations/hydrobasins/model-input-files.ts";
import { nominalFeatures } from "../../src/domain/training/nominal-features.ts";
import { sources, catchmentId } from "./support.ts";
const capture = await readWeatherFile(
  new URL("../../data/weather/previous_runs-2024-01-01-2024-04-30.json.gz", import.meta.url),
);
const terrain = await readBundledTerrain();
it("keeps numerically available archive features ineligible without actual as-of evidence", () => {
  const value = nominalFeatures(
    capture,
    terrain,
    sources.catchments,
    catchmentId,
    "2024-02-21T05:00:00Z",
    72,
  );
  expect(Object.values(value.features).every((v) => v !== null)).toBe(true);
  expect(value.trainingEligible).toBe(false);
  expect(value.provenance.forecastIssuedAt).toBeNull();
});
it("keeps missing archive rainfall null and refuses retrospective weather predictors", () => {
  const missing = nominalFeatures(
    capture,
    terrain,
    sources.catchments,
    catchmentId,
    "2024-01-30T05:00:00Z",
    24,
  );
  expect(missing.features.forecastRainMm).toBeNull();
  expect(missing.features.antecedentRainMm168h).toBeNull();
  expect(() =>
    nominalFeatures(
      { ...capture, kind: "reanalysis" },
      terrain,
      sources.catchments,
      catchmentId,
      "2024-02-21T05:00:00Z",
      24,
    ),
  ).toThrow("not reanalysis");
});
