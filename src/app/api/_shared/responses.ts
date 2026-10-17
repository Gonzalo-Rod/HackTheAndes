import type { ApiError } from "@/contracts/road-alerts";

// Consistent JSON responses for route handlers. Error bodies never include stack traces
// or provider payloads.

export function jsonResponse(body: unknown, requestId: string, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", "X-Request-Id": requestId } });
}

export function errorResponse(status: number, code: string, message: string, requestId: string): Response {
  const body: ApiError = { error: { code, message } };
  return jsonResponse(body, requestId, status);
}

export const STATUS_BY_ERROR_CODE: Record<string, number> = {
  not_found: 404,
  upstream_format: 502,
  upstream_unavailable: 503,
};
