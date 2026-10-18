import { expect, it, vi } from "vitest";
import type { QatomConfiguration } from "@/config/env";
import { createQatomClient } from "./client";
const config: QatomConfiguration = {
  QATOM_MCP_URL: "https://synthetic.mcp.m.todaq.net",
  QATOM_CLIENT_ID: "agent_synthetic",
  QATOM_CLIENT_SECRET: "synthetic-secret",
  QATOM_CATALOG_ITEM_ID: 123,
  QATOM_USD_TDN_DQ: "synthetic",
  QATOM_FULFILMENT_TOKEN: "x".repeat(32),
  OPENAI_QATOM_MODEL: "synthetic-model",
};
const id = "b2b0d2c6-1f4e-4a90-9a1e-2c9a4a7f0f11";
const purchase = {
  transaction_id: id,
  catalog_item_id: 123,
  amount: "0.001",
  dq: "synthetic",
  settled_at: "2026-10-18T04:00:00Z",
  dispatch_status: "pending",
};
const token = { access_token: "synthetic-token", expires_in: 3600, token_type: "Bearer" };
it("obtains a resource-bound managed-agent token and verifies purchases server to server", async () => {
  const fetchImpl = vi.fn<typeof fetch>(async (_url, init) => Response.json(init?.method === "POST" ? token : { purchase }));
  const client = createQatomClient(config, { fetchImpl });
  expect(await client.purchase(id, "trace")).toEqual(purchase);
  expect(await client.accessToken("trace")).toBe(token.access_token);
  expect(fetchImpl).toHaveBeenCalledTimes(2);
  expect(fetchImpl.mock.calls[0]?.[1]?.body).toBe("grant_type=client_credentials&resource=https%3A%2F%2Fsynthetic.mcp.m.todaq.net");
  expect(fetchImpl.mock.calls[1]?.[0]).toBe(`https://pay.m.todaq.net/v4/catalog/purchases/${id}`);
});
it("coalesces concurrent token exchanges and refreshes before expiry", async () => {
  let now = 0;
  const fetchImpl = vi.fn<typeof fetch>(async () => Response.json(token));
  const client = createQatomClient(config, { fetchImpl }, () => now);
  await Promise.all([client.accessToken("trace"), client.accessToken("trace")]);
  expect(fetchImpl).toHaveBeenCalledTimes(1);
  now = 3_550_000;
  await client.accessToken("trace");
  expect(fetchImpl).toHaveBeenCalledTimes(2);
});
it.each([429, 500])("retries idempotent verification after HTTP %i", async (status) => {
  let gets = 0;
  const fetchImpl = vi.fn<typeof fetch>(async (_url, init) => {
    if (init?.method === "POST") return Response.json(token);
    return ++gets === 1 ? Response.json({}, { status }) : Response.json({ purchase });
  });
  expect(await createQatomClient(config, { fetchImpl, sleep: async () => {} }).purchase(id, "trace")).toEqual(purchase);
  expect(gets).toBe(2);
});
it.each([401, 429, 500])("does not retry token POST after HTTP %i", async (status) => {
  const fetchImpl = vi.fn<typeof fetch>(async () => Response.json({}, { status }));
  await expect(createQatomClient(config, { fetchImpl }).accessToken("trace")).rejects.toThrow();
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});
it("rejects malformed sale responses", async () => {
  const client = createQatomClient(config, {
    fetchImpl: async (_url, init) => Response.json(init?.method === "POST" ? token : { purchase: { ...purchase, amount: "1.000" } }),
  });
  await expect(client.purchase(id, "trace")).rejects.toThrow();
});
it("bounds stalled token requests without retrying", async () => {
  const fetchImpl = vi.fn<typeof fetch>(
    async (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
      }),
  );
  await expect(createQatomClient(config, { fetchImpl, timeoutMs: 10 }).accessToken("trace")).rejects.toMatchObject({ kind: "timeout" });
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});
