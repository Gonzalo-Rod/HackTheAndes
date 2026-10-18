import { expect, it, vi } from "vitest";
vi.mock("@peruroad/road-data/official-warnings", () => ({ createWarningProvider: vi.fn() }));
import { warningFeatureSchema } from "@peruroad/road-data/model-inputs/spatial-contracts";
import { NationalWarningsSchema } from "@/contracts/model-inputs";
import { createNationalWarnings } from "./national-warnings";

const feature = warningFeatureSchema.parse({
  type: "Feature" as const,
  id: "quebrada:2026-10-17:1",
  geometry: {
    type: "Polygon" as const,
    coordinates: [
      [
        [-77, -12],
        [-76.9, -12],
        [-76.9, -11.9],
        [-77, -12],
      ],
    ],
  },
  properties: {
    provider: "senamhi" as const,
    product: "quebrada_activation" as const,
    rawLevel: "Nivel 2",
    label: "Amarillo" as const,
    providerDate: "2026-10-17",
    description: "d",
    recommendation: "r",
    validFrom: "2026-10-17T18:00:00.000Z",
    validUntil: "2026-10-18T18:00:00.000Z",
    validityBasis: "bulletin_local_time_assumed_America_Lima" as const,
    automatedRiskUse: false as const,
  },
});
const layer = { features: [feature] };
const NOW = Date.parse("2026-10-18T06:00:00Z");

function setup(live: () => Promise<typeof layer>) {
  let now = NOW;
  const fetchLive = vi.fn(live);
  const readSnapshot = vi.fn(async () => ({ capturedAt: "2026-10-17T23:46:37.760Z", warnings: layer }));
  const load = createNationalWarnings({ fetchLive, readSnapshot, now: () => now });
  return { load, fetchLive, readSnapshot, advance: (ms: number) => (now += ms) };
}

it("serves live national warnings and reuses them for ten minutes", async () => {
  const { load, fetchLive, advance } = setup(async () => layer);
  const first = NationalWarningsSchema.parse(await load("r"));
  expect(first.meta).toMatchObject({ state: "live", capturedAt: new Date(NOW).toISOString() });
  expect(first.data.features).toHaveLength(1);
  advance(9 * 60_000);
  await load("r");
  expect(fetchLive).toHaveBeenCalledTimes(1);
  advance(2 * 60_000);
  await load("r");
  expect(fetchLive).toHaveBeenCalledTimes(2);
});

it("falls back to the last live result, then to the dated capture, labeled as such", async () => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  let fail = false;
  const { load, readSnapshot, advance } = setup(async () => {
    if (fail) throw new Error("timeout");
    return layer;
  });
  await load("r");
  fail = true;
  advance(11 * 60_000);
  expect((await load("r")).meta.state).toBe("cache");
  expect(readSnapshot).not.toHaveBeenCalled();

  const cold = setup(async () => {
    throw new Error("timeout");
  });
  const snapshot = await cold.load("r");
  expect(snapshot.meta).toMatchObject({ state: "snapshot", capturedAt: "2026-10-17T23:46:37.760Z" });
  expect(snapshot.meta.message).toContain("no implica ausencia de peligro");
});
