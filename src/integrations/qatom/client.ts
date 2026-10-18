import { z } from "zod";
import type { QatomConfiguration } from "@/config/env";
import { settledPurchaseSchema } from "@/contracts/alert-passes";
import { getJson, postUrlEncoded, type RequestOptions } from "@/integrations/http/fetch-json";

const tokenSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().int().positive(),
  token_type: z.string().refine((v) => v.toLowerCase() === "bearer"),
});
export function createQatomClient(
  config: QatomConfiguration,
  options: Pick<RequestOptions, "fetchImpl" | "sleep" | "timeoutMs"> = {},
  now = Date.now,
) {
  let cached: { token: string; expiresAt: number } | null = null;
  let exchange: Promise<string> | null = null;
  async function fetchToken(traceId: string) {
    const body = await postUrlEncoded(
      "https://pay.m.todaq.net/v4/oidc/token",
      new URLSearchParams({
        grant_type: "client_credentials",
        resource: new URL(config.QATOM_MCP_URL).origin,
      }),
      {
        ...options,
        provider: "qatom",
        operation: "qatom.authenticate",
        requestId: traceId,
        headers: { Authorization: `Basic ${Buffer.from(`${config.QATOM_CLIENT_ID}:${config.QATOM_CLIENT_SECRET}`).toString("base64")}` },
      },
    );
    const token = tokenSchema.parse(body);
    cached = { token: token.access_token, expiresAt: now() + token.expires_in * 1000 };
    return cached.token;
  }
  return {
    async accessToken(traceId: string) {
      if (cached && cached.expiresAt > now() + 60_000) return cached.token;
      if (!exchange)
        exchange = fetchToken(traceId).finally(() => {
          exchange = null;
        });
      return exchange;
    },
    async purchase(transactionId: string, traceId: string) {
      const id = z.uuid().parse(transactionId);
      const token = await this.accessToken(traceId);
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
