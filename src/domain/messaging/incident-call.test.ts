import { describe, expect, it } from "vitest";
import { composeIncidentCall, selectIncidentForCall, type OfficialAlertsSnapshot } from "./incident-call";

type StoredAlert = OfficialAlertsSnapshot["alerts"][number];

function stored(overrides: Partial<StoredAlert["alert"]> = {}, lastObservedAt = "2026-10-18T04:00:00Z"): StoredAlert {
  return {
    alert: {
      source: "sutran",
      externalId: "3e20237e-1aca-4f6a-879f-95333e74b131",
      externalCode: "A-1",
      roadCode: "PE-22",
      roadStatus: "interrumpido",
      sourceRoadStatus: "INTERRUMPIDO",
      cause: "Derrumbe",
      title: "KM 74 - DERRUMBE",
      description: null,
      currentSituation: "Maquinaria en la zona",
      location: null,
      kilometerLabel: "Km. 74+200",
      kilometer: 74.2,
      direction: null,
      sourceEntity: null,
      eventDate: "2026-10-17",
      validFrom: null,
      validUntil: null,
      sourceUpdatedAt: null,
      retrievedAt: "2026-10-18T04:00:00Z",
      expired: false,
      notYetValid: false,
      ...overrides,
    },
    firstObservedAt: "2026-10-18T03:00:00Z",
    lastObservedAt,
    historySynced: true,
  };
}

const snapshot = (alerts: StoredAlert[], state: OfficialAlertsSnapshot["state"] = "ready"): OfficialAlertsSnapshot => ({
  state,
  // 23:10 on October 17 in Lima (UTC−05:00).
  asOf: "2026-10-18T04:10:00Z",
  alerts,
});

describe("selectIncidentForCall", () => {
  it("prefers closures over restrictions and normal traffic", () => {
    const restricted = stored({ externalId: "00000000-0000-4000-8000-000000000001", roadStatus: "restringido" });
    const closed = stored({ externalId: "00000000-0000-4000-8000-000000000002" });
    const normal = stored({ externalId: "00000000-0000-4000-8000-000000000003", roadStatus: "normal" });
    expect(selectIncidentForCall([normal, restricted, closed])?.alert.externalId).toBe(closed.alert.externalId);
  });

  it("prefers the most recently observed among equal statuses", () => {
    const older = stored({ externalId: "00000000-0000-4000-8000-000000000001" }, "2026-10-18T01:00:00Z");
    const newer = stored({ externalId: "00000000-0000-4000-8000-000000000002" }, "2026-10-18T04:00:00Z");
    expect(selectIncidentForCall([older, newer])?.alert.externalId).toBe(newer.alert.externalId);
  });

  it("skips expired and not-yet-valid alerts", () => {
    expect(selectIncidentForCall([stored({ expired: true }), stored({ notYetValid: true })])).toBeNull();
  });
});

describe("composeIncidentCall", () => {
  it("reads the official facts aloud with the Lima time and no clearance claim", () => {
    const result = composeIncidentCall(snapshot([stored()]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.spokenText).toContain("KM 74 - DERRUMBE.");
    expect(result.value.spokenText).toContain("Tránsito interrumpido.");
    expect(result.value.spokenText).toContain("Ubicación: kilómetro 74 más 200.");
    expect(result.value.spokenText).toContain("17 de octubre");
    expect(result.value.spokenText).toContain("no confirma que otros tramos estén libres");
    expect(result.value.spokenText).not.toMatch(/https?:/);
    expect(result.value.followUpText).toContain("La ausencia de otras alertas no confirma vía libre.");
  });

  it("announces stale data as possibly outdated", () => {
    const result = composeIncidentCall(snapshot([stored()], "stale"));
    expect(result.ok && result.value.spokenText).toContain("pueden haber cambiado");
  });

  it("omits missing optional fields", () => {
    const result = composeIncidentCall(snapshot([stored({ kilometerLabel: null, currentSituation: null })]));
    expect(result.ok && result.value.spokenText).not.toContain("Ubicación");
    expect(result.ok && result.value.spokenText).not.toContain("Situación");
  });

  it("does not call when the source is unavailable", () => {
    expect(composeIncidentCall({ state: "unavailable", asOf: null, alerts: [] })).toEqual({ ok: false, error: "source_unavailable" });
  });

  it("does not call when no incident is active", () => {
    expect(composeIncidentCall(snapshot([]))).toEqual({ ok: false, error: "no_active_incident" });
  });
});
