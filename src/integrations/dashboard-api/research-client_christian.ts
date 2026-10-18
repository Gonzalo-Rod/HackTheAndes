import { ResearchCatalogSchema, type ResearchCatalog } from "@/contracts/research_christian";
import { getJson, UpstreamError } from "@/integrations/http/fetch-json";

export async function fetchResearchCatalog(): Promise<ResearchCatalog> {
  const body = await getJson("/api/research", {
    provider: "dashboard-api",
    operation: "dashboard.research",
    timeoutMs: 15_000,
    retries: 0,
  });
  const parsed = ResearchCatalogSchema.safeParse(body);
  if (!parsed.success) throw new UpstreamError("La investigación llegó con un formato inesperado.", "invalid_body", "dashboard-api");
  return parsed.data;
}
