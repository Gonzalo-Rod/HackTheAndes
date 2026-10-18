import { describe, expect, it } from "vitest";

import type { RoadAlert } from "@/contracts/road-alerts";
import { SUTRAN_ALERT_PE22, SUTRAN_ALERT_TUMBES } from "@/test/fixtures/sutran";

import {
  causeStatusMatrix,
  EMPTY_FILTERS,
  facetCounts,
  filterAlerts,
  hasActiveFilters,
  matchesQuery,
  regionOptions,
  sortByRecentAction,
  summarizeAlerts,
  toggleValue,
} from "./filters";
import { normalizeSutranAlert } from "./normalize";

function alert(overrides: Partial<RoadAlert> = {}): RoadAlert {
  const base = normalizeSutranAlert(SUTRAN_ALERT_PE22);
  if (!base) throw new Error("fixture must normalize");
  return { ...base, ...overrides };
}

const pe22 = alert();
const tumbesBase = normalizeSutranAlert(SUTRAN_ALERT_TUMBES);
if (!tumbesBase) throw new Error("fixture must normalize");
const tumbes = tumbesBase;
const closed = alert({ id: "c", roadStatus: "interrumpido", cause: "fenomenos_naturales", lastActionAt: "2026-10-17T15:21:32.269Z" });
const all = [pe22, tumbes, closed];

describe("filterAlerts", () => {
  it("returns everything without filters", () => {
    expect(filterAlerts(all, EMPTY_FILTERS)).toHaveLength(3);
  });

  it("combines status, cause, region and road filters", () => {
    expect(filterAlerts(all, { ...EMPTY_FILTERS, statuses: ["restringido"] }).map((a) => a.id)).toEqual([pe22.id, tumbes.id]);
    expect(filterAlerts(all, { ...EMPTY_FILTERS, causes: ["fenomenos_naturales"] }).map((a) => a.id)).toEqual(["c"]);
    expect(filterAlerts(all, { ...EMPTY_FILTERS, regionKey: "TUMBES" }).map((a) => a.id)).toEqual([tumbes.id]);
    expect(filterAlerts(all, { ...EMPTY_FILTERS, roadCode: "PE-22", statuses: ["interrumpido"] }).map((a) => a.id)).toEqual(["c"]);
  });

  it("filters by source origin, keeping community reports separate from SUTRAN", () => {
    const report = alert({ id: "community:7f0c", roadStatus: "desconocido" });
    const withReport = [...all, report];
    expect(filterAlerts(withReport, { ...EMPTY_FILTERS, origins: ["comunidad"] }).map((a) => a.id)).toEqual([report.id]);
    expect(filterAlerts(withReport, { ...EMPTY_FILTERS, origins: ["oficial"] })).toHaveLength(3);
    expect(filterAlerts(withReport, { ...EMPTY_FILTERS, origins: ["oficial", "comunidad"] })).toHaveLength(4);
    expect(facetCounts(withReport, { ...EMPTY_FILTERS, origins: ["comunidad"] }).origins).toEqual({ oficial: 3, comunidad: 1 });
    expect(facetCounts(withReport, { ...EMPTY_FILTERS, statuses: ["interrumpido"] }).origins).toEqual({ oficial: 1, comunidad: 0 });
  });

  it("searches without accents or case", () => {
    expect(matchesQuery(pe22, "cocachacra")).toBe(true);
    expect(matchesQuery(pe22, "TRAILER pe-22")).toBe(true);
    expect(matchesQuery(pe22, "tumbes")).toBe(false);
    expect(matchesQuery(pe22, "   ")).toBe(true);
  });
});

describe("facets and summaries", () => {
  it("counts each facet with the other filters applied", () => {
    const counts = facetCounts(all, { ...EMPTY_FILTERS, statuses: ["interrumpido"], roadCode: "PE-22" });
    expect(counts.statuses).toMatchObject({ interrumpido: 1, restringido: 1, normal: 0 });
    expect(counts.causes).toMatchObject({ fenomenos_naturales: 1, accidentes: 0 });
  });

  it("lists regions alphabetically with counts", () => {
    expect(regionOptions(all)).toEqual([
      { key: "LIMA", label: "Lima", count: 2 },
      { key: "TUMBES", label: "Tumbes", count: 1 },
    ]);
  });

  it("summarizes status counts, roads and regions", () => {
    expect(summarizeAlerts(all)).toMatchObject({ total: 3, roadCount: 2, regionCount: 2, byStatus: { interrumpido: 1, restringido: 2 } });
    expect(summarizeAlerts([])).toMatchObject({ total: 0, roadCount: 0 });
  });

  it("sorts by last action, then severity", () => {
    expect(sortByRecentAction(all).map((a) => a.id)).toEqual(["c", pe22.id, tumbes.id]);
  });

  it("builds the cause × status matrix without empty causes", () => {
    const rows = causeStatusMatrix(all, ["fenomenos_naturales", "accidentes", "infraestructura", "humano", "otro"]);
    expect(rows.map((r) => r.cause)).toEqual(["fenomenos_naturales", "accidentes", "infraestructura"]);
    expect(rows[1]).toMatchObject({ total: 1, byStatus: { restringido: 1 } });
  });

  it("detects active filters and toggles values", () => {
    expect(hasActiveFilters(EMPTY_FILTERS)).toBe(false);
    expect(hasActiveFilters({ ...EMPTY_FILTERS, query: "km" })).toBe(true);
    expect(hasActiveFilters({ ...EMPTY_FILTERS, origins: ["comunidad"] })).toBe(true);
    expect(toggleValue(["a"], "b")).toEqual(["a", "b"]);
    expect(toggleValue(["a", "b"], "a")).toEqual(["b"]);
  });
});
