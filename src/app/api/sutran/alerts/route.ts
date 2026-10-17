import { connection, type NextRequest } from "next/server";
import { z } from "zod";

import { errorResponse, jsonResponse, STATUS_BY_ERROR_CODE } from "@/app/api/_shared/responses";
import { roadAlertsService } from "@/services/instances";

const QuerySchema = z.object({ fresh: z.enum(["0", "1"]).optional() });

// GET /api/sutran/alerts — current SUTRAN road alerts (contract: src/contracts/road-alerts.ts).
// ?fresh=1 requests a refresh, honored when the server cache is at least 15 s old.
export async function GET(request: NextRequest) {
  await connection();
  const requestId = crypto.randomUUID();
  const query = QuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!query.success) return errorResponse(400, "invalid_query", "Parámetros de consulta inválidos.", requestId);

  const result = await roadAlertsService.getCurrentAlerts({ forceRefresh: query.data.fresh === "1", requestId });
  if (!result.ok) {
    return errorResponse(STATUS_BY_ERROR_CODE[result.error.code] ?? 502, result.error.code, result.error.message, requestId);
  }
  return jsonResponse(result.value, requestId);
}
