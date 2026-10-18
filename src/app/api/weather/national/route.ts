import { connection } from "next/server";

import { errorResponse, jsonResponse } from "@/app/api/_shared/responses";
import { nationalRainService } from "@/services/instances";

// GET /api/weather/national — model rain on a coarse grid over Peru (contract: src/contracts/weather.ts).
export async function GET() {
  await connection();
  const requestId = crypto.randomUUID();
  const result = await nationalRainService.getRain(requestId);
  if (!result.ok) return errorResponse(503, result.error.code, result.error.message, requestId);
  return jsonResponse(result.value, requestId);
}
