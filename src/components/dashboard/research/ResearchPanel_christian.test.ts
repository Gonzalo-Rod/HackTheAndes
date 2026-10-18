import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { loadResearchFiles } from "@/integrations/research-files/research-files_christian";
import { createResearchCatalogService } from "@/services/research-catalog-service_christian";
import { MapStateOverlay } from "@/components/dashboard/MapStateOverlay";

import { ResearchPanel } from "./ResearchPanel_christian";

const now = () => Date.parse("2026-10-18T00:40:00Z");

describe("research evidence presentation", () => {
  it("shows scope, official-notice provenance, dated snapshots, source catalog and weekly leads", async () => {
    const data = await createResearchCatalogService({ loadFiles: loadResearchFiles, now }).getCatalog("render-test");
    const html = renderToStaticMarkup(
      createElement(ResearchPanel, {
        state: { data, error: null, refreshing: false, refresh: async () => undefined },
        now: now(),
        topic: null,
        selectedId: null,
        onSelect: () => undefined,
        onCenter: () => undefined,
        liveSources: null,
      }),
    );
    expect(html).toContain("Cobertura del demo: PE-22 y Valle del Mantaro");
    expect(html).toContain("Aviso 422");
    expect(html).toContain("Pronóstico próximo");
    expect(html).toContain("Fuentes y verificación · 39 referencias");
    expect(html).toContain("noticias por verificar");
    expect(html).toContain("no se cuentan como alertas ni generan pines");
  });
  it("lets an area-only warning open its official source without offering a fabricated map location", async () => {
    const data = await createResearchCatalogService({ loadFiles: loadResearchFiles, now }).getCatalog("render-test");
    const id = "senamhi-warning-422-central-andes-2026-10-18-19";
    const html = renderToStaticMarkup(
      createElement(ResearchPanel, {
        state: { data, error: null, refreshing: false, refresh: async () => undefined },
        now: now(),
        topic: null,
        selectedId: id,
        onSelect: () => undefined,
        onCenter: () => undefined,
        liveSources: null,
      }),
    );
    expect(html).toContain("Abrir fuente oficial");
    expect(html).toContain("Sin coordenadas verificadas");
    expect(html).toContain("Lluvia prevista 2026-10-18");
    expect(html).not.toContain(">Ver referencia</button>");
    expect(html).toContain("No se verificó la intersección");
  });
  it("keeps the map usable for environmental evidence when SUTRAN is unavailable", () => {
    const html = renderToStaticMarkup(
      createElement(MapStateOverlay, {
        loading: false,
        mapReady: true,
        mapError: null,
        dataError: "Consulta fallida",
        staleMessage: null,
        refreshing: false,
        partialData: true,
        onRetry: () => undefined,
      }),
    );
    expect(html).toContain("pr-banner");
    expect(html).not.toContain('class="pr-overlay"');
    expect(html).toContain("referencias ambientales mantienen su fecha original");
  });
});
