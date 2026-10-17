import { describe, expect, it } from "vitest";

import { SUTRAN_ALERT_PE22, SUTRAN_ALERT_TUMBES } from "@/test/fixtures/sutran";

import {
  latestActionAt,
  normalizeSutranAlert,
  normalizeSutranAlerts,
  normalizeSutranEvidence,
  normalizeSutranHistory,
} from "./normalize";
import { parseKm, parseSutranDate, regionLabel, safeHttpUrl, titleCase, toSentenceCase } from "./parsing";

describe("parsing", () => {
  it("parses SUTRAN DD/MM/YYYY dates", () => {
    expect(parseSutranDate("17/10/2026")).toBe("2026-10-17");
    expect(parseSutranDate("1/2/2026")).toBe("2026-02-01");
    expect(parseSutranDate("31/02/2026")).toBeNull();
    expect(parseSutranDate("2026-10-17")).toBeNull();
    expect(parseSutranDate(null)).toBeNull();
  });

  it.each([
    ["KM 51", 51, null],
    ["KM 64+800", 64.8, null],
    ["KM 770 + 800", 770.8, null],
    ["Km 1281+260", 1281.26, null],
    ["Km 04", 4, null],
    ["KM 41+948 - 41+982", 41.948, 41.982],
    ["sin dato", null, null],
  ])("parses the km text %s", (text, km, kmEnd) => {
    expect(parseKm(text)).toEqual({ km, kmEnd });
  });

  it("formats provider text for display", () => {
    expect(toSentenceCase("KM 51 - DESPISTE EN LA PE-22 CON APOYO DE LA PNP")).toBe("KM 51 - despiste en la PE-22 con apoyo de la PNP");
    expect(toSentenceCase("Obras por pérdida de calzada")).toBe("Obras por pérdida de calzada");
    expect(titleCase("SANTA CRUZ DE COCACHACRA")).toBe("Santa Cruz de Cocachacra");
    expect(regionLabel("Junin")).toBe("Junín");
    expect(regionLabel("LIMA")).toBe("Lima");
  });

  it("accepts only http(s) URLs", () => {
    expect(safeHttpUrl("javascript:alert(1)")).toBeNull();
    expect(safeHttpUrl("not a url")).toBeNull();
    expect(safeHttpUrl("https://www.gob.pe/sutran")).toBe("https://www.gob.pe/sutran");
  });
});

describe("normalizeSutranAlert", () => {
  it("maps a real SUTRAN record to the contract", () => {
    expect(normalizeSutranAlert(SUTRAN_ALERT_PE22)).toMatchObject({
      id: SUTRAN_ALERT_PE22.id,
      code: "SIGEA-171026-01",
      cause: "accidentes",
      roadStatus: "restringido",
      title: "KM 51 - despiste y volcadura de una carreta de un tráiler",
      roadCode: "PE-22",
      roadName: "Carretera Central",
      km: 51,
      region: "Lima",
      regionKey: "LIMA",
      district: "Santa Cruz de Cocachacra",
      eventDate: "2026-10-17",
      validUntil: "2026-10-31",
      sourceUrl: null,
      lastActionAt: "2026-10-17T15:21:32.269Z",
    });
  });

  it("maps unknown status and cause values to safe defaults", () => {
    const alert = normalizeSutranAlert({ ...SUTRAN_ALERT_PE22, estadoVia: "cerrado", motivo: "huelga" });
    expect(alert?.roadStatus).toBe("desconocido");
    expect(alert?.cause).toBe("otro");
  });

  it("drops records that cannot be placed in Peru", () => {
    expect(normalizeSutranAlert({ ...SUTRAN_ALERT_PE22, lat: null })).toBeNull();
    expect(normalizeSutranAlert({ ...SUTRAN_ALERT_PE22, lat: 40.4, lng: -3.7 })).toBeNull();
    expect(normalizeSutranAlert({ ...SUTRAN_ALERT_PE22, id: "  " })).toBeNull();
  });
});

describe("normalizeSutranAlerts", () => {
  it("keeps alerts in force and orders them by last action", () => {
    const expired = { ...SUTRAN_ALERT_PE22, id: "expired", vencida: true };
    const notYet = { ...SUTRAN_ALERT_PE22, id: "future", aunNoVigente: true };
    const { alerts, skippedCount } = normalizeSutranAlerts([SUTRAN_ALERT_TUMBES, expired, SUTRAN_ALERT_PE22, notYet]);
    expect(alerts.map((a) => a.code)).toEqual(["SIGEA-171026-01", "SIGEA-250926-08"]);
    expect(skippedCount).toBe(2);
    expect(latestActionAt(alerts)).toBe("2026-10-17T15:21:32.269Z");
  });

  it("handles an empty SUTRAN response", () => {
    expect(normalizeSutranAlerts([])).toEqual({ alerts: [], skippedCount: 0 });
    expect(latestActionAt([])).toBeNull();
  });
});

describe("history and evidence", () => {
  it("orders history newest first and maps statuses", () => {
    expect(
      normalizeSutranHistory([
        { fecha: "2026-10-17T15:21:32.269Z", tipo: "publicacion", estadoNuevo: null },
        { fecha: "2026-10-17T18:00:00.000Z", tipo: "cambio_estado", estadoNuevo: "normal" },
      ]),
    ).toEqual([
      { date: "2026-10-17T18:00:00.000Z", type: "cambio_estado", newStatus: "normal" },
      { date: "2026-10-17T15:21:32.269Z", type: "publicacion", newStatus: null },
    ]);
  });

  it("keeps evidence with safe URLs only", () => {
    expect(
      normalizeSutranEvidence([
        { tipo: "foto", url: "https://cdn.test/a.jpg", nombre: "a.jpg" },
        { tipo: "video", url: "ftp://x", posterUrl: null },
      ]),
    ).toEqual([{ kind: "foto", url: "https://cdn.test/a.jpg", posterUrl: null, name: "a.jpg" }]);
  });
});
