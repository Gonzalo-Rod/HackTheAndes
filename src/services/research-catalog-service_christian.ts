import {
  EvidenceFeatureSchema,
  EvidenceFileSchema,
  ResearchSourceInputSchema,
  SourceFileSchema,
} from "@/contracts/research-input_christian";
import { EnvironmentalRecordSchema, ResearchCatalogSchema, type ResearchCatalog } from "@/contracts/research_christian";
import { WeeklyStateSchema } from "@/contracts/weekly-incident-report_christian";
import { normalizeEvidence } from "@/domain/research/normalize-evidence_christian";
import { isVerifiedMapRecord } from "@/domain/research/map-evidence_christian";
import type { ResearchFiles } from "@/integrations/research-files/research-files_christian";
import { logger } from "@/lib/logger";

export function createResearchCatalogService(dependencies: { loadFiles: () => Promise<ResearchFiles>; now: () => number }) {
  return {
    async getCatalog(requestId: string): Promise<ResearchCatalog> {
      const files = await dependencies.loadFiles();
      const warnings = [...files.warnings];
      const catalog: ResearchCatalog = {
        servedAt: new Date(dependencies.now()).toISOString(),
        retrievedAt: null,
        scope: "PE-22 y extensión del Mantaro",
        records: [],
        sources: [],
        weeklyReports: [],
        documents: files.documents,
        warnings,
        archivedRecordCount: 0,
      };
      const evidence = EvidenceFileSchema.safeParse(files.evidence);
      let rejected = 0;
      if (evidence.success) {
        catalog.retrievedAt = evidence.data.retrievedAt;
        catalog.scope = evidence.data.projectScope;
        const ids = new Set<string>();
        for (const feature of evidence.data.features) {
          const parsed = EvidenceFeatureSchema.safeParse(feature);
          const normalized = parsed.success ? normalizeEvidence(parsed.data) : null;
          const checked = EnvironmentalRecordSchema.safeParse(normalized);
          if (!checked.success || ids.has(checked.data.id)) {
            rejected++;
            continue;
          }
          const record = checked.data;
          ids.add(record.id);
          if (!isVerifiedMapRecord(record)) {
            catalog.archivedRecordCount++;
            continue;
          }
          catalog.records.push(record);
        }
      } else warnings.push("Las evidencias ambientales no superaron la validación y no se muestran.");
      const sources = SourceFileSchema.safeParse(files.sources);
      if (sources.success) {
        for (const source of sources.data.sources) {
          const parsed = ResearchSourceInputSchema.safeParse(source);
          if (parsed.success) catalog.sources.push(parsed.data);
          else rejected++;
        }
      } else warnings.push("El catálogo de fuentes no está disponible.");
      for (const weekly of files.weekly) {
        const parsed = WeeklyStateSchema.safeParse(weekly.data);
        if (parsed.success) catalog.weeklyReports.push(parsed.data);
        else {
          rejected++;
          warnings.push("Un archivo semanal tiene un formato inválido y no se muestra.");
        }
      }
      catalog.weeklyReports.sort((a, b) => b.window.startDate.localeCompare(a.window.startDate));
      if (rejected) warnings.push(`${rejected} registros inválidos, duplicados o sin un tipo reconocido fueron excluidos.`);
      logger.info({
        operation: "research.catalog",
        provider: "research-files",
        requestId,
        result: "ok",
        records: catalog.records.length,
        sources: catalog.sources.length,
        weeklyReports: catalog.weeklyReports.length,
        rejected,
        archived: catalog.archivedRecordCount,
      });
      return ResearchCatalogSchema.parse(catalog);
    },
  };
}
