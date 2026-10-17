import { connection, type NextRequest } from "next/server";
import { z } from "zod";

import { errorResponse, jsonResponse, STATUS_BY_ERROR_CODE } from "@/app/api/_shared/responses";
import { roadAlertsService } from "@/services/instances";

const ParamsSchema = z.object({ id: z.uuid() });

// GET /api/sutran/alerts/:id — sub-cause, tags, evidence and status history of one alert.
export async function GET(_request: NextRequest, ctx: RouteContext<"/api/sutran/alerts/[id]">) {
  await connection();
  const requestId = crypto.randomUUID();
  const params = ParamsSchema.safeParse(await ctx.params);
  if (!params.success) return errorResponse(400, "invalid_id", "Identificador de alerta inválido.", requestId);

  const result = await roadAlertsService.getAlertDetail(params.data.id, { requestId });
  if (!result.ok) {
    return errorResponse(STATUS_BY_ERROR_CODE[result.error.code] ?? 502, result.error.code, result.error.message, requestId);
  }
  return jsonResponse(result.value, requestId);
}
