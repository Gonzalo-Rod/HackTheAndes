import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { createExposureView, readBundledExposure } from "@peruroad/road-data/exposure";
import type { RoadContextResponse } from "@peruroad/road-data/context/contracts";
import type { ForecastRoad } from "@/contracts/forecast-roads";
import type { AlertsResponse } from "@/contracts/road-alerts";
import type { RoadPosition } from "@/db/road-locator";
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
type Assessment = typeof record.assessment;
/** Every bundled segment is linked now; recreate an unlinked one to keep unknown coverage tested. */
function withUnlinkedSegment(assessment: Assessment): Assessment {
  const copy = structuredClone(assessment);
  // A catchment must keep at least one segment, so unlink one from a shared catchment.
  const target = copy.segments.find((segment) =>
    segment.catchmentIds.every((id) => (copy.catchments.find((c) => c.catchmentId === id)?.segmentIds.length ?? 0) > 1),
  );
  if (!target) throw new Error("Fixture needs a segment in a shared catchment");
  const unknown = <T extends { state: string; category: unknown; reasons: unknown }>(window: T): T => ({
    ...window,
    state: "unknown",
    category: null,
    reasons: ["no_catchment_link"],
  });
  for (const catchment of copy.catchments) catchment.segmentIds = catchment.segmentIds.filter((id) => id !== target.segmentId);
  target.catchmentIds = [];
  target.windows = {
    next24h: unknown(target.windows.next24h),
    next72h: unknown(target.windows.next72h),
    sixHourly: target.windows.sixHourly.map(unknown),
  };
  return copy;
}
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
  const { service, exposure } = setup();
  const assessment = withUnlinkedSegment(record.assessment);
  exposure.mockResolvedValue(createExposureView(assessment, Date.parse(assessment.assessedAt), "database", 24));
  const reply = await service.exposure(null, "req");
  expect(reply).toContain("173/174");
  expect(reply).toContain("1 sin evaluación");
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
  expect(reply).toContain(
    `km ${segment.distanceFromOriginStartKm.toFixed(0)}-${segment.distanceFromOriginEndKm.toFixed(0)} del mapa de PE-22`,
  );
  expect(reply).toContain("Confirma");
  expect(reply).toContain("mm");
  expect(reply).toContain("INGEMMET");
  expect(reply).not.toContain("km oficial");
});
it("keeps an unlinked segment unknown", async () => {
  const { service, context, exposure } = setup();
  const assessment = withUnlinkedSegment(record.assessment);
  exposure.mockResolvedValue(createExposureView(assessment, Date.parse(assessment.assessedAt), "database", 24));
  const segment = assessment.segments.find((item) => !item.catchmentIds.length);
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

describe("national sources shared with the dashboard", () => {
  const OTHER_REVISION = "b".repeat(64);
  const roads: ForecastRoad[] = [
    { roadCode: "PE-22", name: "Carretera Central", geometryRevision: "", measuredLengthKm: 174, pilot: true },
    { roadCode: "PE-08B", name: "CARRETERA CAJAMARCA ", geometryRevision: OTHER_REVISION, measuredLengthKm: 549, pilot: false },
  ];
  const alertsResponse: AlertsResponse = {
    alerts: [],
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
    },
  };
  function viewFor(road: ForecastRoad | undefined) {
    const assessment = {
      ...record.assessment,
      geometryRevision: road && !road.pilot ? road.geometryRevision : record.assessment.geometryRevision,
    };
    return createExposureView(assessment, Date.parse(record.assessment.assessedAt), "database", 24);
  }
  function nationalSetup() {
    const base = setup();
    const registered = roads.map((road) => (road.pilot ? { ...road, geometryRevision: record.assessment.geometryRevision } : road));
    const national = {
      alerts: vi.fn(async (): Promise<AlertsResponse | null> => alertsResponse),
      roads: vi.fn(async () => registered),
      locate: vi.fn(async (): Promise<RoadPosition | null> => null),
    };
    const exposure = vi.fn(async (road?: ForecastRoad) => viewFor(road));
    const service = createRoadInformation({
      context: base.context,
      exposure,
      geometryRevision: record.assessment.geometryRevision,
      publicUrl,
      national,
    });
    return { ...base, national, exposure, service };
  }

  it("answers ESTADO from the live national feed instead of the pilot database", async () => {
    const { service, national, context } = nationalSetup();
    const reply = await service.status("req", "pe 8b");
    expect(reply).toContain("Sin alertas vigentes de SUTRAN en PE-8B");
    expect(national.alerts).toHaveBeenCalledOnce();
    expect(context).not.toHaveBeenCalled();
  });

  it("explains an unrecognized ESTADO argument and still gives the national summary", async () => {
    const { service } = nationalSetup();
    const reply = await service.status("req", "Chosica");
    expect(reply).toContain('No reconozco "Chosica"');
    expect(reply).toContain("Sin alertas vigentes en el país");
  });

  it("shows the unavailable state when the national feed has no data at all", async () => {
    const { service, national } = nationalSetup();
    national.alerts.mockResolvedValue(null);
    expect(await service.status("req")).toContain("No podemos consultar");
  });

  it("reads a registered road by code, with zero-padding differences", async () => {
    const { service, exposure } = nationalSetup();
    const reply = await service.exposure({ place: "PE-8B" }, "req");
    expect(reply).toContain("Exposición climática estimada PE-08B");
    expect(reply).toContain("carretera=PE-08B");
    expect(exposure).toHaveBeenCalledWith(expect.objectContaining({ roadCode: "PE-08B" }));
  });

  it("names the covered roads when a road has no estimate yet", async () => {
    const { service } = nationalSetup();
    const reply = await service.exposure({ place: "PE-1N" }, "req");
    expect(reply).toContain("PE-1N aún no tiene estimación");
    expect(reply).toContain("PE-22, PE-08B");
  });

  it("compares every registered road and lists unreadable ones as unavailable, not low risk", async () => {
    const { service, exposure } = nationalSetup();
    exposure.mockImplementation(async (road?: ForecastRoad) => {
      if (road?.roadCode === "PE-08B") throw new Error("database down");
      return viewFor(road);
    });
    const reply = await service.exposure(null, "req");
    expect(reply).toContain("en 2 carreteras con estimación");
    expect(reply).toContain("• PE-22:");
    expect(reply).toContain("Sin evaluación vigente: PE-08B. No implica riesgo bajo.");
  });

  it("matches a pin off PE-22 to another registered road", async () => {
    const { service, context, national } = nationalSetup();
    context.mockResolvedValue(located("ignored", "outside_corridor"));
    const segment = record.assessment.segments.find((item) => item.windows.next24h.state === "assessed");
    if (!segment) throw new Error("Fixture must contain assessed coverage");
    national.locate.mockResolvedValue({
      roadCode: "PE-08B",
      geometryRevision: OTHER_REVISION,
      segmentId: segment.segmentId,
      distanceFromOriginKm: segment.distanceFromOriginStartKm,
      distanceFromRoadM: 40,
    });
    const reply = await service.exposure({ latitude: -7.1, longitude: -78.5 }, "req");
    expect(national.locate).toHaveBeenCalledWith({ latitude: -7.1, longitude: -78.5 }, [OTHER_REVISION]);
    expect(reply).toContain("del mapa de PE-08B");
  });

  it("rejects a pin far from every registered road and lists them", async () => {
    const { service, context } = nationalSetup();
    context.mockResolvedValue(located("ignored", "outside_corridor"));
    const reply = await service.exposure({ latitude: -12, longitude: -70 }, "req");
    expect(reply).toContain("más de 500 m de las carreteras con estimación (PE-22, PE-08B)");
  });
});
