import { connection } from "next/server";

import { errorResponse, jsonResponse } from "@/app/api/_shared/responses";
import { logger } from "@/lib/logger";
import { researchCatalogService } from "@/services/research-instance_christian";

export async function GET() {
  await connection();
  const requestId = crypto.randomUUID();
  try {
    return jsonResponse(await researchCatalogService.getCatalog(requestId), requestId);
  } catch (error) {
    logger.error({ operation: "research.catalog", requestId, result: "error", errorType: error instanceof Error ? error.name : "unknown" });
    return errorResponse(
      503,
      "research_unavailable",
      "La investigación no está disponible. Las alertas viales siguen siendo independientes.",
      requestId,
    );
  }
}
