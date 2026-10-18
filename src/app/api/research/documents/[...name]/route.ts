import { connection, type NextRequest } from "next/server";

import { errorResponse } from "@/app/api/_shared/responses";
import { readResearchDocument } from "@/integrations/research-files/research-files_christian";
import { logger } from "@/lib/logger";

export async function GET(_request: NextRequest, context: RouteContext<"/api/research/documents/[...name]">) {
  await connection();
  const requestId = crypto.randomUUID();
  try {
    const { name } = await context.params;
    const document = await readResearchDocument(name.join("/"));
    if (!document) return errorResponse(404, "not_found", "Documento no encontrado.", requestId);
    return new Response(document.body, {
      headers: {
        "Content-Type": document.format === "json" ? "application/json; charset=utf-8" : "text/plain; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-store",
        "X-Request-Id": requestId,
      },
    });
  } catch (error) {
    logger.error({
      operation: "research.document",
      requestId,
      result: "error",
      errorType: error instanceof Error ? error.name : "unknown",
    });
    return errorResponse(503, "research_unavailable", "No se pudo leer el documento.", requestId);
  }
}
