import { connection } from "next/server";

import { errorResponse, jsonResponse } from "@/app/api/_shared/responses";
import { corridorRainService } from "@/services/instances";

// GET /api/weather/pe22 — rain along the Carretera Central (contract: src/contracts/weather.ts).
export async function GET() {
  await connection();
  const requestId = crypto.randomUUID();
  const result = await corridorRainService.getRain(requestId);
  if (!result.ok) return errorResponse(503, result.error.code, result.error.message, requestId);
  return jsonResponse(result.value, requestId);
}
