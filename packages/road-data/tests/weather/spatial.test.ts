import { expect, it } from "vitest";
import { slopeDegrees, slopeSamplePositions } from "../../src/domain/spatial/slope.ts";
import { parseWarningValidity } from "../../src/integrations/senamhi/warnings.ts";
import { readBundledTerrain } from "../../src/integrations/hydrobasins/model-input-files.ts";
import { terrainCaptureSchema } from "../../src/contracts/spatial-inputs.ts";
it("computes the finite-difference slope of flat and inclined planes", () => {
  expect(slopeDegrees([10, 10, 10, 10])).toBe(0);
  expect(slopeDegrees([0, 180, 0, 0])).toBeCloseTo(45);
  expect(() => slopeDegrees([0, Number.NaN, 0, 0])).toThrow("Missing");
  const [west, east, south, north] = slopeSamplePositions([-77, -12]);
  expect(west[0]).toBeLessThan(-77);
  expect(east[0]).toBeGreaterThan(-77);
  expect(south[1]).toBeLessThan(-12);
  expect(north[1]).toBeGreaterThan(-12);
});
it("rejects inconsistent terrain means, incomplete weights and duplicate catchment identities", async () => {
  const capture = await readBundledTerrain();
  const first = capture.catchments[0];
  if (!first) throw new Error("Missing terrain fixture");
  for (const catchments of [
    [{ ...first, estimatedMeanSlopeDegrees: 0 }],
    [
      {
        ...first,
        samples: first.samples.map((sample) => ({ ...sample, weight: sample.weight / 2 })),
      },
    ],
    [first, first],
  ])
    expect(terrainCaptureSchema.safeParse({ ...capture, catchments }).success).toBe(false);
});
it("preserves the documented local-time assumption for bulletin validity", () => {
  expect(
    parseWarningValidity(
      "Fecha de inicio: <div>Sábado 17 octubre 2026 - 13:00 horas</div> Duraci&oacute;n: <b>24 hrs</b>",
    ),
  ).toEqual({
    date: "2026-10-17",
    validFrom: "2026-10-17T18:00:00.000Z",
    validUntil: "2026-10-18T18:00:00.000Z",
  });
  expect(parseWarningValidity("Unknown product with no valid period")).toBeNull();
  expect(
    parseWarningValidity("Fecha de inicio: 32 octubre 2026 - 13:00 horas Duración: 24 hrs"),
  ).toBeNull();
});
