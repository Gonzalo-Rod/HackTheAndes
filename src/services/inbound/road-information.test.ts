import { beforeAll, beforeEach, afterEach, expect, it, vi } from "vitest";
import { createExposureView, readBundledExposure } from "@peruroad/road-data/exposure";
import type { RoadContextResponse } from "@peruroad/road-data/context/contracts";
import { createRoadInformation } from "./road-information";
let record: Awaited<ReturnType<typeof readBundledExposure>>;
beforeAll(async () => {
  record = await readBundledExposure();
});
beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());
const publicUrl = "https://example.test";
function setup() {
  const context = vi.fn<(input: unknown, requestId: string) => Promise<RoadContextResponse>>(async () => ({
    kind: "official_alerts",
    state: "ready",
    servedAt: record.assessment.assessedAt,
    asOf: record.assessment.assessedAt,
    dataAgeMs: 0,
    message: "Latest complete poll",
    alerts: [],
    absenceDoesNotConfirmClearance: true,
  }));
  const exposure = vi.fn(async () => createExposureView(record.assessment, Date.parse(record.assessment.assessedAt), "database", 24));
  return {
    context,
    exposure,
    service: createRoadInformation({ context, exposure, geometryRevision: record.assessment.geometryRevision, publicUrl }),
  };
}
it("keeps an empty official feed distinct from clearance and exposure", async () => {
  const { service } = setup();
  const reply = await service.status("req");
  expect(reply).toContain("Sin alertas vigentes");
  expect(reply).toContain("no confirma vía libre");
  expect(reply).toContain("Exposición estimada");
});
it("renders known coverage without counting unknown segments as routine", async () => {
  const { service } = setup();
  const reply = await service.exposure(null, "req");
  expect(reply).toContain("38/174");
  expect(reply).toContain("136 sin evaluación");
  expect(reply).toContain("no probabilidad");
});
it("suppresses stale exposure categories at the exact freshness boundary", async () => {
  const { service, exposure } = setup();
  exposure.mockResolvedValue(
    createExposureView(
      record.assessment,
      Date.parse(record.assessment.sources.weatherCapturedAt) + record.assessment.policy.weatherMaxAgeMs,
      "database",
      24,
    ),
  );
  const reply = await service.exposure(null, "req");
  expect(reply).toContain("desactualizada");
  expect(reply).not.toContain("atención alta:");
});
function located(segmentId: string, status: "matched" | "outside_corridor" | "ambiguous" = "matched"): RoadContextResponse {
  return {
    kind: "location",
    state: "ready",
    servedAt: record.assessment.assessedAt,
    asOf: record.assessment.assessedAt,
    dataAgeMs: 0,
    message: "Approximate location",
    status,
    location:
      status === "matched"
        ? {
            geometryRevision: record.assessment.geometryRevision,
            segmentId,
            snappedPosition: [-76.5, -11.8],
            distanceFromOriginKm: 1,
            distanceFromRoadM: 10,
          }
        : null,
    candidates: [],
    requiresConfirmation: true,
  };
}
it("uses only the matched segment, forecast window, rainfall and uncertainty", async () => {
  const { service, context } = setup();
  const segment = record.assessment.segments.find((item) => item.windows.next24h.state === "assessed");
  if (!segment) throw new Error("Fixture must contain assessed coverage");
  context.mockResolvedValue(located(segment.segmentId));
  const reply = await service.exposure({ latitude: -11.8, longitude: -76.5 }, "req");
  expect(reply).toContain(`tramo ${segment.segmentId}`);
  expect(reply).toContain("Confirma");
  expect(reply).toContain("mm");
  expect(reply).toContain("INGEMMET");
  expect(reply).not.toContain("km oficial");
});
it("keeps an unlinked segment unknown", async () => {
  const { service, context } = setup();
  const segment = record.assessment.segments.find((item) => !item.catchmentIds.length);
  if (!segment) throw new Error("Fixture must contain unknown coverage");
  context.mockResolvedValue(located(segment.segmentId));
  expect(await service.exposure({ place: "Matucana" }, "req")).toContain("sin evaluación utilizable");
});
it.each(["outside_corridor", "ambiguous"] as const)("does not apply corridor exposure to %s pins/places", async (status) => {
  const { service, context, exposure } = setup();
  context.mockResolvedValue(located("ignored", status));
  const reply = await service.exposure({ place: "unknown" }, "req");
  expect(reply).toContain(status === "outside_corridor" ? "500 m" : "tramo único");
  expect(exposure).not.toHaveBeenCalled();
});
it("fails visibly on data outages without disclosing database errors", async () => {
  const { service, context, exposure } = setup();
  context.mockRejectedValue(new Error("secret SQL text"));
  exposure.mockRejectedValue(new Error("secret file"));
  const status = await service.status("req");
  const forecast = await service.exposure(null, "req");
  expect(status).toContain("No podemos consultar");
  expect(forecast).toContain("No podemos consultar");
  expect(status + forecast).not.toContain("secret");
});
