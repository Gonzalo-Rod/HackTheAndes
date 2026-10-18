import { expect, it, vi } from "vitest";
import type { AlertsResponse, RoadAlert } from "@/contracts/road-alerts";
import { normalizeSutranAlert } from "@/domain/road-alerts/normalize";
import { SUTRAN_ALERT_PE22 } from "@/test/fixtures/sutran";
import { nationalOfficialCandidates } from "./national-official";

const base = normalizeSutranAlert(SUTRAN_ALERT_PE22);
if (!base) throw new Error("fixture must normalize");
const revision = "b".repeat(64);
const nowMs = Date.parse("2026-10-18T15:10:00Z");
const alert = (overrides: Partial<RoadAlert>): RoadAlert => ({ ...base, ...overrides });
const response = (alerts: RoadAlert[], overrides: Partial<AlertsResponse["meta"]> = {}): AlertsResponse => ({
  alerts,
  meta: {
    source: "SUTRAN",
    endpoint: "alerts",
    fetchedAt: "2026-10-18T15:00:00.000Z",
    servedAt: "2026-10-18T15:00:00.000Z",
    latestActionAt: null,
    stale: false,
    fallback: "none",
    staleReason: null,
    skippedCount: 0,
    ...overrides,
  },
});
const placed = { roadCode: "PE-08B", geometryRevision: revision, segmentId: "s", distanceFromOriginKm: 42.3, distanceFromRoadM: 30 };

it("places the road's live alerts on its geometry with their severity", async () => {
  const locate = vi.fn(async () => placed);
  const candidates = await nationalOfficialCandidates({
    response: response([
      alert({ id: "x", roadCode: "PE-8B", roadStatus: "interrumpido", title: "Huaico" }),
      alert({ id: "y", roadCode: "PE-1N" }),
    ]),
    roadCode: "PE-08B",
    revision,
    locate,
    nowMs,
  });
  expect(locate).toHaveBeenCalledOnce();
  expect(candidates).toEqual([
    expect.objectContaining({ key: "sutran:x", kind: "official", level: 3, startKm: 42.3, expiresAt: "2026-10-18T15:30:00.000Z" }),
  ]);
  expect(candidates[0]?.text).toContain("vía cerrada");
});

it("skips alerts more than 500 m from the road", async () => {
  const candidates = await nationalOfficialCandidates({
    response: response([alert({ roadCode: "PE-08B" })]),
    roadCode: "PE-08B",
    revision,
    locate: async () => null,
    nowMs,
  });
  expect(candidates).toEqual([]);
});

it.each([
  ["a missing feed", null],
  ["cached data after a SUTRAN failure", response([alert({ roadCode: "PE-08B" })], { stale: true, fallback: "cache" })],
  ["data at the 30-minute boundary", response([alert({ roadCode: "PE-08B" })], { fetchedAt: "2026-10-18T14:40:00.000Z" })],
])("never alerts from %s", async (_, feed) => {
  const locate = vi.fn(async () => placed);
  expect(await nationalOfficialCandidates({ response: feed, roadCode: "PE-08B", revision, locate, nowMs })).toEqual([]);
  expect(locate).not.toHaveBeenCalled();
});
