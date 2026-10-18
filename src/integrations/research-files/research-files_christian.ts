import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import evidence from "../../../docs/research/environment-map-evidence-2026-10-17_christian.json";
import verifiedEvidence from "../../../docs/research/verified-map-evidence-2026-10-17_christian.json";
import sources from "../../../docs/research/environment-sources_christian.json";
import type { ResearchDocument } from "@/contracts/research_christian";
import { logger } from "@/lib/logger";

const RESEARCH_ROOT = path.join(process.cwd(), "docs", "research");
const DOCUMENT_NAME = /^[a-z0-9][a-z0-9._-]*_christian\.(md|json)$/;
const MAX_DOCUMENT_BYTES = 2_000_000;

const TITLES: Record<string, string> = {
  "official-map-geometries-2026-10-17": "Geometrías oficiales de INGEMMET y SENAMHI",
  "verified-map-evidence-2026-10-17": "Puntos y áreas ambientales verificados",
  "geography-verification-2026-10-17": "Auditoría geográfica y llamadas de Tavily",
  "map-verification-handoff": "Reglas de verificación y cobertura del mapa",
  "environment-map-evidence-2026-10-17": "Evidencias ambientales y coordenadas",
  "environment-evidence-2026-10-17": "Observaciones ambientales originales",
  "environment-sources": "Catálogo de fuentes ambientales",
  "hydromet-sources": "Fuentes de agua, lluvia y heladas",
  "landslide-sources": "Fuentes de huaicos y laderas",
  "agri-pest-sources": "Fuentes agrícolas y fitosanitarias",
  "problem-definition-and-notice-audit": "Problema y auditoría de titulares",
  "pe22-incidents-2026-10-10_17": "Investigación histórica de incidentes",
  "source-research-calls": "Registro de investigación de fuentes",
  "tavily-followup-2026-10-17": "Registro de verificación con Tavily",
};

function describeDocument(name: string): ResearchDocument {
  const basename = path.posix.basename(name);
  const format = basename.endsWith(".json") ? "json" : "md";
  const stem = basename.replace(/_christian\.(json|md)$/, "");
  return {
    name,
    title: TITLES[stem] ?? stem.replaceAll("-", " "),
    format,
    url: `/api/research/documents/${name.split("/").map(encodeURIComponent).join("/")}`,
  };
}

export interface ResearchFiles {
  evidence: unknown;
  sources: unknown;
  documents: ResearchDocument[];
  warnings: string[];
}

async function documentNames(): Promise<string[]> {
  return (await readdir(RESEARCH_ROOT)).filter((name) => DOCUMENT_NAME.test(name)).sort();
}

export async function loadResearchFiles(): Promise<ResearchFiles> {
  const warnings: string[] = [];
  let names: string[] = [];
  try {
    names = await documentNames();
  } catch (error) {
    logger.warn({
      operation: "research.listFiles",
      provider: "research-files",
      result: "error",
      errorType: error instanceof Error ? error.name : "unknown",
    });
    warnings.push("Los documentos de investigación no están disponibles. Las evidencias ambientales conservan su fecha de captura.");
  }
  return {
    evidence: {
      ...evidence,
      retrievedAt: verifiedEvidence.retrievedAt,
      projectScope: verifiedEvidence.projectScope,
      features: [...evidence.features, ...verifiedEvidence.features],
    },
    sources,
    documents: names.map(describeDocument),
    warnings,
  };
}

export async function readResearchDocument(name: string): Promise<{ body: string; format: "md" | "json" } | null> {
  // Resolve only names returned by the manifest. No client-controlled path is read.
  const allowed = (await documentNames()).find((candidate) => candidate === name);
  if (!allowed) return null;
  const body = await readFile(path.join(RESEARCH_ROOT, allowed), "utf8");
  if (Buffer.byteLength(body) > MAX_DOCUMENT_BYTES) return null;
  return { body, format: allowed.endsWith(".json") ? "json" : "md" };
}
