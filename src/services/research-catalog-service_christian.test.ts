import { describe, expect, it } from "vitest";

import { loadResearchFiles, readResearchDocument } from "@/integrations/research-files/research-files_christian";

import { createResearchCatalogService } from "./research-catalog-service_christian";

const now = () => Date.parse("2026-10-18T00:40:00Z");

describe("integrated research catalog", () => {
  it("serves the real source registry, environmental evidence and original documents", async () => {
    const service = createResearchCatalogService({ loadFiles: loadResearchFiles, now });
    const catalog = await service.getCatalog("test");
    expect(catalog.records).toHaveLength(323);
    expect(catalog.archivedRecordCount).toBe(13);
    expect(catalog.records.every((record) => record.geometry && record.geometrySourceUrl && record.startsAt)).toBe(true);
    expect(catalog.records.some((record) => record.id === "senasa-junin-fruit-fly-trap-network-reference")).toBe(false);
    expect(catalog.sources).toHaveLength(41);
    expect(catalog.documents.some((document) => document.name === "problem-definition-and-notice-audit_christian.md")).toBe(true);
    expect(catalog.warnings).toEqual([]);
    expect(catalog.sources.some((source) => source.categories.includes("pests"))).toBe(true);
  });
  it("keeps valid environmental evidence when the source registry fails validation", async () => {
    const files = await loadResearchFiles();
    const catalog = await createResearchCatalogService({
      loadFiles: async () => ({ ...files, sources: null }),
      now,
    }).getCatalog("test");
    expect(catalog.records).toHaveLength(323);
    expect(catalog.sources).toEqual([]);
    expect(catalog.warnings).toHaveLength(1);
  });
  it("serves only manifest-listed research documents", async () => {
    expect(await readResearchDocument("../AGENTS.md")).toBeNull();
    expect(await readResearchDocument("../../.env.local")).toBeNull();
    const document = await readResearchDocument("environment-map-evidence-2026-10-17_christian.json");
    expect(document?.format).toBe("json");
    expect(JSON.parse(document?.body ?? "{}").features).toHaveLength(22);
  });
});
