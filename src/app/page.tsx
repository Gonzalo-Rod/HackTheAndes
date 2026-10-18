import { connection } from "next/server";
import { Suspense } from "react";

import { Dashboard } from "@/components/dashboard/Dashboard";
import type { ResearchCatalog } from "@/contracts/research_christian";
import { logger } from "@/lib/logger";
import { researchCatalogService } from "@/services/research-instance_christian";

async function ResearchedDashboard() {
  await connection();
  let research: ResearchCatalog | null = null;
  try {
    research = await researchCatalogService.getCatalog(crypto.randomUUID());
  } catch (error) {
    logger.warn({ operation: "dashboard.initialResearch", result: "fallback", errorType: error instanceof Error ? error.name : "unknown" });
  }
  return <Dashboard initialResearch={research} />;
}

export default function HomePage() {
  return (
    <Suspense fallback={<Dashboard />}>
      <ResearchedDashboard />
    </Suspense>
  );
}
