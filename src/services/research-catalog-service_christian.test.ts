import { describe, expect, it } from "vitest";

import { loadResearchFiles, readResearchDocument } from "@/integrations/research-files/research-files_christian";

import { createResearchCatalogService } from "./research-catalog-service_christian";

const now = () => Date.parse("2026-10-18T00:40:00Z");

describe("integrated research catalog", () => {
  it("serves the real source registry, environmental evidence, weekly archive and original documents", async () => {
    const service = createResearchCatalogService({ loadFiles: loadResearchFiles, now });
    const catalog = await service.getCatalog("test");
    expect(catalog.records).toHaveLength(323);
    expect(catalog.archivedRecordCount).toBe(13);
    expect(catalog.records.every((record) => record.geometry && record.geometrySourceUrl && record.startsAt)).toBe(true);
    expect(catalog.records.some((record) => record.id === "senasa-junin-fruit-fly-trap-network-reference")).toBe(false);
    expect(catalog.sources).toHaveLength(41);
    expect(catalog.weeklyReports.length).toBeGreaterThan(0);
    expect(catalog.documents.some((document) => document.name === "problem-definition-and-notice-audit_christian.md")).toBe(true);
    expect(catalog.warnings).toEqual([]);
    expect(catalog.sources.some((source) => source.categories.includes("pests"))).toBe(true);
  });
  it("does not merge news leads or archived road observations into live environmental alerts", async () => {
    const catalog = await createResearchCatalogService({ loadFiles: loadResearchFiles, now }).getCatalog("test");
    expect(catalog.weeklyReports[0]?.news.length).toBeGreaterThan(0);
    expect(catalog.records.every((record) => !record.id.startsWith("news:"))).toBe(true);
    expect(catalog.weeklyReports[0]?.sutran[0]?.lastSeenAt).toBeDefined();
  });
  it("keeps valid environmental evidence when the source registry or weekly state fails validation", async () => {
    const files = await loadResearchFiles();
    const catalog = await createResearchCatalogService({
      loadFiles: async () => ({ ...files, sources: null, weekly: [{ name: "invalid", data: {} }] }),
      now,
    }).getCatalog("test");
    expect(catalog.records).toHaveLength(323);
    expect(catalog.sources).toEqual([]);
    expect(catalog.weeklyReports).toEqual([]);
    expect(catalog.warnings).toHaveLength(3);
  });
  it("serves only manifest-listed research documents", async () => {
    expect(await readResearchDocument("../AGENTS.md")).toBeNull();
    expect(await readResearchDocument("../../.env.local")).toBeNull();
    const document = await readResearchDocument("environment-map-evidence-2026-10-17_christian.json");
    expect(document?.format).toBe("json");
    expect(JSON.parse(document?.body ?? "{}").features).toHaveLength(22);
  });
  it("rejects archive links with an unsafe protocol before they reach the dashboard", async () => {
    const files = await loadResearchFiles();
    const previous = await createResearchCatalogService({ loadFiles: async () => files, now }).getCatalog("test");
    const week = previous.weeklyReports[0];
    if (!week || !week.news[0]) throw new Error("Real weekly news fixture missing");
    const unsafe = { ...week, news: [{ ...week.news[0], url: "javascript:alert(1)" }] };
    const catalog = await createResearchCatalogService({
      loadFiles: async () => ({ ...files, weekly: [{ name: "unsafe", data: unsafe }] }),
      now,
    }).getCatalog("test");
    expect(catalog.weeklyReports).toEqual([]);
    expect(catalog.warnings.length).toBeGreaterThan(0);
    expect(catalog.records).toHaveLength(323);
  });
});
