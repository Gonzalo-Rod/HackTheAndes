import { describe, expect, it } from "vitest";
import type { AlertsResponse, RoadAlert } from "@/contracts/road-alerts";
import { normalizeSutranAlert } from "@/domain/road-alerts/normalize";
import { SUTRAN_ALERT_PE22 } from "@/test/fixtures/sutran";
import { formatNationalStatus, formatRoadStatus } from "./status-reply";

const base = normalizeSutranAlert(SUTRAN_ALERT_PE22);
if (!base) throw new Error("fixture must normalize");
const alert = (overrides: Partial<RoadAlert>): RoadAlert => ({ ...base, ...overrides });
const URL_BASE = "https://example.test";

function response(alerts: RoadAlert[], stale = false): AlertsResponse {
  return {
    alerts,
    meta: {
      source: "SUTRAN",
      endpoint: "alerts",
      fetchedAt: "2026-10-18T15:00:00.000Z",
      servedAt: "2026-10-18T15:00:00.000Z",
      latestActionAt: null,
      stale,
      fallback: stale ? "cache" : "none",
      staleReason: stale ? "timeout" : null,
      skippedCount: 0,
    },
  };
}

const closedNorth = alert({ id: "n1", roadCode: "PE-1N", roadStatus: "interrumpido", title: "Huaico en Piura", kmText: "Km 1020" });
const restrictedCentral = alert({ id: "c1", roadCode: "PE-22", roadStatus: "restringido", title: "Derrumbe parcial" });
const normalCentral = alert({ id: "c2", roadCode: "PE-22", roadStatus: "normal", title: "Tránsito normalizado" });

describe("formatNationalStatus", () => {
  it("lists the most severe alerts first with their road and counts by status", () => {
    const reply = formatNationalStatus(response([normalCentral, restrictedCentral, closedNorth]), URL_BASE);
    expect(reply).toContain("3 alertas vigentes en el Perú: 1 interrumpida y 1 restringida.");
    expect(reply.indexOf("Huaico en Piura")).toBeLessThan(reply.indexOf("Derrumbe parcial"));
    expect(reply).toContain("(PE-1N, km 1020");
    expect(reply).toContain("Carreteras con más alertas: PE-22 (2), PE-1N (1).");
    expect(reply).toContain("ESTADO PE-22");
  });

  it("never presents an empty feed as clearance", () => {
    const reply = formatNationalStatus(response([]), URL_BASE);
    expect(reply).toContain("Sin alertas vigentes en el país");
    expect(reply).toContain("no confirma vía libre");
  });

  it("labels cached data when SUTRAN did not answer", () => {
    expect(formatNationalStatus(response([closedNorth], true), URL_BASE)).toContain("datos guardados");
  });
});

describe("formatRoadStatus", () => {
  it("keeps only the requested road and links to that road on the map", () => {
    const reply = formatRoadStatus(response([closedNorth, restrictedCentral, normalCentral]), "PE-22", URL_BASE);
    expect(reply).toContain("PE-22: 2 alertas vigentes");
    expect(reply).not.toContain("Piura");
    expect(reply).toContain(`${URL_BASE}/?carretera=PE-22`);
  });

  it("links straight to the alert when the road has only one", () => {
    const reply = formatRoadStatus(response([closedNorth, restrictedCentral]), "PE-22", URL_BASE);
    expect(reply).toContain(`${URL_BASE}/?alerta=c1`);
  });

  it("matches codes regardless of zero padding", () => {
    const reply = formatRoadStatus(response([alert({ id: "b", roadCode: "PE-08B" })]), "PE-8B", URL_BASE);
    expect(reply).toContain("1 alerta vigente");
  });

  it("says a road without alerts is not confirmed clear", () => {
    const reply = formatRoadStatus(response([closedNorth]), "PE-32", URL_BASE);
    expect(reply).toContain("Sin alertas vigentes de SUTRAN en PE-32");
    expect(reply).toContain("no confirma vía libre");
  });
});
