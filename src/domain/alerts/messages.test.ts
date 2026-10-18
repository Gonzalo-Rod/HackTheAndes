import { describe, it, expect } from "vitest";
import type { AlertCandidate } from "@/contracts/notifications";
import { alertLocation, communityAlertText, formatAlertBundle, MAX_ALERT_MESSAGE_CHARACTERS, officialAlertText } from "./messages";
import { planAlerts } from "./policy";
const until = "2026-10-19T02:00:00.000Z";
const candidate = (overrides: Partial<AlertCandidate> = {}): AlertCandidate => ({
  key: "exposure:one",
  fingerprint: "policy:priority",
  kind: "exposure",
  level: 2,
  startKm: 2,
  endKm: 3,
  expiresAt: until,
  forecastUntil: until,
  text: "Technical evidence stays in the assessment",
  isTest: false,
  ...overrides,
});
describe("plain Spanish driver alerts", () => {
  it("combines repeated climate explanations while retaining separate approximate kilometer ranges", () => {
    const body = formatAlertBundle(
      [candidate(), candidate({ key: "exposure:two", startKm: 4, endKm: 5 }), candidate({ key: "exposure:three", startKm: 10, endKm: 11 })],
      true,
    );
    expect(body).toContain("DEMO · PeruRoad · PE-22");
    expect(body).toContain("km aprox. del mapa: 2–3, 4–5, 10–11 (no oficiales)");
    expect(body).not.toContain("2–11");
    expect(body.match(/Lluvia prevista/g)).toHaveLength(1);
    expect(body).toContain("Hasta 18/10, 21:00 (hora Perú)");
    expect(body).toContain("estimación, no un evento confirmado");
    expect(body).toContain("EXPOSICION: detalles. BAJA: cancelar.");
    expect(body).not.toMatch(/priority|high_attention|susceptibilidad|INGEMMET|\.\d+Z|mm\/24|Technical evidence/);
    expect(body.length).toBeLessThan(450);
  });
  it("shows fractional distances without requiring a named reference point or repeating a range", () => {
    const item = candidate({ startKm: 23.4, endKm: 24.5 });
    const body = formatAlertBundle([item, { ...item, key: "exposure:duplicate" }], false);
    expect(body).toContain("km aprox. del mapa: 23.4–24.5 (no oficiales)");
    expect(body.match(/23\.4–24\.5/g)).toHaveLength(1);
  });
  it("keeps each distinct source and unconfirmed report label in a mixed bundle", () => {
    const body = formatAlertBundle(
      [
        candidate(),
        candidate({ kind: "official", text: officialAlertText("interrumpido", "Derrumbe", "cerca del puente RIO BLANCO") }),
        candidate({ kind: "community", text: communityAlertText("inundacion", "cerca del puente HUACHIPA", false) }),
      ],
      false,
    );
    expect(body).toContain("SUTRAN: vía cerrada");
    expect(body).toContain("Reporte SIN CONFIRMAR");
    expect(body).toContain("estimación");
    expect(body).not.toContain("DEMO");
  });
  it("bounds three legal messages without losing uncertainty or opt-out", () => {
    const long = "x".repeat(800);
    for (let climateCount = 0; climateCount <= 3; climateCount++) {
      const items = Array.from({ length: 3 }, (_, i) =>
        candidate({
          key: `exposure:${i}`,
          kind: i < climateCount ? "exposure" : "official",
          text: `SUTRAN: ${long}`,
          startKm: 170.1 + i,
          endKm: 170.9 + i,
        }),
      );
      const body = formatAlertBundle(items, true);
      expect(body.length).toBeLessThanOrEqual(MAX_ALERT_MESSAGE_CHARACTERS);
      expect(body.endsWith("BAJA: cancelar.")).toBe(true);
      if (climateCount) expect(body).toContain("no un evento confirmado");
    }
  });
  it("never presents geometry distance as an official road kilometer when no nearby landmark exists", () => {
    const location = alertLocation(20, 21, [{ name: "HUACHIPA", kind: "bridge", distanceKm: 10.4 }]);
    expect(location).toContain("inicio del mapa (no km oficiales)");
    expect(location).not.toContain("HUACHIPA");
  });
  it("uses only landmarks within the exact two-kilometer distance boundary", () => {
    const places = [{ name: "Peaje CORCONA", kind: "toll" as const, distanceKm: 48.4 }];
    expect(alertLocation(50.4, 51, places)).toBe("cerca del peaje CORCONA");
    expect(alertLocation(50.401, 51, places)).toContain("no km oficiales");
  });
  it("does not turn official normal status into a safe-road guarantee", () => {
    expect(officialAlertText("normal", "Tránsito restablecido", "cerca del peaje CORCONA")).toContain("SUTRAN: informa tránsito normal");
  });
  it("changing presentation does not retrigger an unchanged condition", () => {
    const alert = candidate({ text: "shorter wording" });
    const plan = planAlerts(
      [alert],
      { [alert.key]: { fingerprint: alert.fingerprint, level: alert.level } },
      { startKm: 0, endKm: 20, isTest: false },
      Date.parse("2026-10-18T03:00:00Z"),
    );
    expect(plan.selected).toHaveLength(0);
  });
});
