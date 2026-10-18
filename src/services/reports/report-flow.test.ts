import { beforeEach, afterEach, expect, it, vi } from "vitest";
import type { ReportDraft, ReportExtraction, ReportRepository, ReportRouting } from "@/contracts/reports";
import { createReportFlow, type ReportFlowDependencies } from "./report-flow";
const NOW = Date.parse("2026-10-18T02:00:00Z");
const REVISION = "a".repeat(64);
const extraction: ReportExtraction = {
  type: "derrumbe",
  placeText: null,
  kilometer: null,
  direction: null,
  severity: null,
  lanesBlocked: 1,
  stillActive: true,
};
const point = {
  geometryRevision: REVISION,
  segmentId: "pe22-test-segment",
  snappedPosition: [-76.5, -11.8] as [number, number],
  distanceFromOriginKm: 50,
  distanceFromRoadM: 30,
};
function setup() {
  let draft: ReportDraft | null = null;
  let publications = 0;
  const replies = new Map<string, ReportRouting>();
  const repository: ReportRepository = {
    async run(_phone, work) {
      return work({
        replay: async (key) => replies.get(key) ?? null,
        readDraft: async () => draft,
        commit: async (input) => {
          const result = input.reply(
            input.publication
              ? {
                  incidentId: "b".repeat(8) + "-1111-4111-8111-" + "b".repeat(12),
                  reportId: input.publication.id,
                  merged: false,
                  independentReporters: 1,
                }
              : null,
          );
          if (input.publication) publications++;
          draft = input.nextDraft;
          replies.set(input.eventKey, result);
          return result;
        },
      });
    },
  };
  const context = vi.fn<ReportFlowDependencies["context"]>(async () => ({
    kind: "location",
    status: "matched",
    state: "ready",
    servedAt: new Date(NOW).toISOString(),
    asOf: new Date(NOW).toISOString(),
    dataAgeMs: 0,
    message: "Approximate location",
    location: point,
    candidates: [],
    requiresConfirmation: true,
  }));
  let idSequence = 0;
  const deps: ReportFlowDependencies = {
    newId: () => `${(++idSequence).toString(16).padStart(8, "0")}-0000-4000-8000-000000000000`,
    repository,
    extractor: { extract: vi.fn(async () => ({ ...extraction })) },
    intentParser: { parse: vi.fn(async () => ({ kind: "report" as const, place: null })) },
    limiter: { consume: vi.fn(async () => true) },
    context,
    pepper: "test-pepper".repeat(4),
    geometryRevision: REVISION,
    publicUrl: "https://example.test",
    teamPhoneKeys: [],
    testPhoneKeys: [],
    now: () => NOW,
  };
  const flow = createReportFlow(deps);
  const message = (text: string, messageId = text) => ({ messageId, from: "+51900000000", messageType: "text", text, content: null });
  return { flow, deps, context, message, getDraft: () => draft, getPublications: () => publications };
}
beforeEach(() => vi.spyOn(console, "warn").mockImplementation(() => undefined));
afterEach(() => vi.restoreAllMocks());
function text(value: ReportRouting) {
  if (value.kind !== "reply") throw new Error("Expected reply");
  return value.text;
}
async function prepare() {
  const s = setup();
  await s.flow.route(s.message("REPORTE PRUEBA Hay un derrumbe bloqueando un carril"), "req");
  return s;
}
async function pin(s: ReturnType<typeof setup>, id = "pin") {
  return s.flow.route({ ...s.message("", id), messageType: "location", content: { latitude: -11.8, longitude: -76.5 } }, "req");
}
it("does not publish until the location and current confirmation code are supplied", async () => {
  const s = await prepare();
  expect(s.getPublications()).toBe(0);
  expect(s.getDraft()?.isTest).toBe(true);
  expect(text(await pin(s))).toContain("CONFIRMAR");
  const code = s.getDraft()?.confirmationCode;
  expect(code).toMatch(/^[A-F0-9]{8}$/);
  const confirmed = await s.flow.route(s.message(`CONFIRMAR ${code}`, "confirm"), "req");
  expect(text(confirmed)).toContain("NO CONFIRMADO");
  expect(text(confirmed)).toContain("?alerta=community:");
  expect(s.getPublications()).toBe(1);
  expect(s.getDraft()).toBeNull();
  expect(await s.flow.route(s.message(`CONFIRMAR ${code}`, "confirm"), "retry")).toEqual(confirmed);
  expect(s.getPublications()).toBe(1);
});
it("replays a lost initial acknowledgment without another extraction", async () => {
  const s = setup();
  const m = s.message("REPORTE Hay un derrumbe");
  const first = await s.flow.route(m, "req");
  expect(await s.flow.route(m, "retry")).toEqual(first);
  expect(s.deps.extractor?.extract).toHaveBeenCalledTimes(1);
});
it("preserves a draft across ordinary status/exposure queries", async () => {
  const s = await prepare();
  const before = s.getDraft();
  expect(await s.flow.route(s.message("ESTADO"), "req")).toEqual({ kind: "unhandled" });
  expect(s.getDraft()).toEqual(before);
});
it("routes natural language once and does not extract a forecast question as a report", async () => {
  const s = setup();
  s.deps.intentParser = { parse: vi.fn(async () => ({ kind: "exposure" as const, place: null })) };
  expect(await s.flow.route(s.message("¿Lloverá mañana?"), "req")).toEqual({
    kind: "intent",
    intent: { kind: "exposure" as const, place: null },
  });
  expect(s.deps.extractor?.extract).not.toHaveBeenCalled();
  expect(s.getDraft()).toBeNull();
});
it.each(["outside_corridor", "ambiguous", "not_found"] as const)("requires another pin for %s location", async (status) => {
  const s = await prepare();
  const base = await s.context({ kind: "pin", latitude: -11.8, longitude: -76.5 }, "req");
  if (base.kind !== "location") throw new Error("Fixture location expected");
  s.context.mockResolvedValue({ ...base, status, location: null });
  const result = await pin(s);
  expect(text(result)).toContain(status === "outside_corridor" ? "500 m" : "pin");
  expect(s.getDraft()?.location).toBeNull();
  expect(s.getPublications()).toBe(0);
});
it("rejects stale codes after a pin change", async () => {
  const s = await prepare();
  await pin(s);
  const old = s.getDraft()?.confirmationCode;
  await pin(s, "pin2");
  expect(text(await s.flow.route(s.message(`CONFIRMAR ${old}`), "req"))).toContain("no corresponde");
  expect(s.getPublications()).toBe(0);
});
it("rejects an expired draft at the exact 30-minute boundary", async () => {
  const s = await prepare();
  await pin(s);
  const code = s.getDraft()?.confirmationCode;
  s.deps.now = () => NOW + 30 * 60_000;
  expect(text(await s.flow.route(s.message(`CONFIRMAR ${code}`), "req"))).toContain("expiró");
  expect(s.getPublications()).toBe(0);
});
it("cancels without publishing and allows a new explicit report", async () => {
  const s = await prepare();
  await s.flow.route(s.message("CANCELAR"), "req");
  expect(s.getDraft()).toBeNull();
  await s.flow.route(s.message("REPORTE PRUEBA Hay otro derrumbe"), "req");
  expect(s.getDraft()).not.toBeNull();
  expect(s.getPublications()).toBe(0);
});
it("keeps the draft and answers visibly if extraction or location fails", async () => {
  const s = await prepare();
  s.deps.extractor = { extract: vi.fn(async () => null) };
  const before = s.getDraft();
  expect(text(await s.flow.route(s.message("Más detalles"), "req"))).toContain("No pude interpretar");
  expect(s.getDraft()).toEqual(before);
  s.context.mockRejectedValue(new Error("private database detail"));
  const result = await pin(s);
  expect(text(result)).toContain("no se publicó");
  expect(text(result)).not.toContain("private");
});
it("asks for a missing type or current observation instead of guessing", async () => {
  const s = setup();
  s.deps.extractor = { extract: vi.fn(async () => ({ ...extraction, type: null, stillActive: null })) };
  expect(text(await s.flow.route(s.message("REPORTE hay algo"), "req"))).toContain("¿Qué ocurre");
  s.deps.extractor = { extract: vi.fn(async () => ({ ...extraction, stillActive: null })) };
  expect(text(await s.flow.route(s.message("Un derrumbe"), "req"))).toContain("sigue activo");
});
it("does not publish a clearing or historical message as an active incident", async () => {
  const s = await prepare();
  s.deps.extractor = { extract: vi.fn(async () => ({ ...extraction, stillActive: false })) };
  expect(text(await s.flow.route(s.message("Ya limpiaron"), "req"))).toContain("no reabre");
  expect(s.getDraft()).toBeNull();
  expect(s.getPublications()).toBe(0);
});
it("bounds report intake and excludes media from extraction", async () => {
  const s = setup();
  s.deps.limiter.consume = vi.fn(async () => false);
  expect(text(await s.flow.route(s.message("REPORTE Hay un derrumbe"), "req"))).toContain("límite");
  expect(s.deps.extractor?.extract).not.toHaveBeenCalled();
  expect(await s.flow.route({ ...s.message("", "media"), messageType: "audio" }, "req")).toEqual({ kind: "unhandled" });
});
it("keeps pins without a pending report as exposure queries", async () => {
  const s = setup();
  expect(await pin(s)).toEqual({ kind: "unhandled" });
});
it("starts a fresh draft for a new explicit REPORTE", async () => {
  const s = await prepare();
  const old = s.getDraft()?.id;
  await s.flow.route(s.message("REPORTE PRUEBA Hay otro incidente", "new"), "req");
  expect(s.getDraft()?.id).not.toBe(old);
});

it("answers a natural-language query without rewriting a pending report", async () => {
  const s = await prepare();
  const before = s.getDraft();
  s.deps.intentParser = { parse: vi.fn(async () => ({ kind: "exposure" as const, place: null })) };
  expect(await s.flow.route(s.message("¿Lloverá mañana?"), "req")).toEqual({ kind: "intent", intent: { kind: "exposure", place: null } });
  expect(s.getDraft()).toEqual(before);
});
it("also marks the REPORTAR PRUEBA alias as test traffic", async () => {
  const s = setup();
  await s.flow.route(s.message("REPORTAR PRUEBA Hay un derrumbe"), "req");
  expect(s.getDraft()?.isTest).toBe(true);
});
it.each(["REPORTE PRUEBA: Hay un derrumbe", "REPORTE PRUEBA. Hay un derrumbe"])(
  "keeps demonstration traffic excluded when punctuation follows PRUEBA: %s",
  async (value) => {
    const s = setup();
    await s.flow.route(s.message(value), "req");
    expect(s.getDraft()?.isTest).toBe(true);
  },
);
it("recognizes a spoken REPORTE DE PRUEBA marker without treating it as traction", async () => {
  const s = setup();
  await s.flow.route(s.message("REPORTE DE PRUEBA. Hay un derrumbe"), "req");
  expect(s.getDraft()?.isTest).toBe(true);
});
