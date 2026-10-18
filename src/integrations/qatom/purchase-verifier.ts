import { z } from "zod";
import type { QatomApiConfiguration } from "@/config/env";
import { settledPurchaseSchema } from "@/contracts/alert-passes";
import { getJson, postJson, type RequestOptions } from "@/integrations/http/fetch-json";

const accountTokenSchema = z.object({ access_token: z.string().min(1), expires_at: z.number().int().positive() });
// Refresh one minute early so verification does not start with an almost-expired token.
const TOKEN_REFRESH_MARGIN_MS = 60_000;

export function createQatomPurchaseVerifier(
  config: QatomApiConfiguration,
  options: Pick<RequestOptions, "fetchImpl" | "sleep" | "timeoutMs"> = {},
  now = Date.now,
) {
  let cached: { token: string; expiresAtMs: number } | null = null;
  let exchange: Promise<string> | null = null;
  async function fetchToken(traceId: string) {
    // MCP agent tokens are rejected by the REST API with token_exchange_required.
    const response = await postJson(
      "https://pay.m.todaq.net/v4/account/oauth/token",
      {},
      {
        ...options,
        provider: "qatom",
        operation: "qatom.authenticate_seller",
        requestId: traceId,
        idempotent: false,
        headers: {
          Authorization: `Basic ${Buffer.from(`${config.QATOM_API_CLIENT_ID}:${config.QATOM_API_CLIENT_SECRET}`).toString("base64")}`,
        },
      },
    );
    const token = accountTokenSchema.parse(response.body);
    const expiresAtMs = token.expires_at * 1000;
    if (expiresAtMs <= now()) throw new Error("Qatom seller returned an expired access token");
    cached = { token: token.access_token, expiresAtMs };
    return cached.token;
  }
  async function accessToken(traceId: string) {
    if (cached && cached.expiresAtMs > now() + TOKEN_REFRESH_MARGIN_MS) return cached.token;
    if (!exchange)
      exchange = fetchToken(traceId).finally(() => {
        exchange = null;
      });
    return exchange;
  }
  return {
    async purchase(transactionId: string, traceId: string) {
      const id = z.uuid().parse(transactionId);
      const token = await accessToken(traceId);
      const body = await getJson(`https://pay.m.todaq.net/v4/catalog/purchases/${id}`, {
        ...options,
        provider: "qatom",
        operation: "qatom.verify_purchase",
        requestId: traceId,
        headers: { Authorization: `Bearer ${token}` },
        logTarget: "qatom/catalog/purchases",
      });
      return z.object({ purchase: settledPurchaseSchema }).parse(body).purchase;
    },
  };
}
