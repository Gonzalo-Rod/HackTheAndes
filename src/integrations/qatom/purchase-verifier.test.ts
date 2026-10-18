import { expect, it, vi } from "vitest";
import { createQatomPurchaseVerifier } from "./purchase-verifier";
const config = { QATOM_API_CLIENT_ID: "seller-synthetic", QATOM_API_CLIENT_SECRET: "synthetic-secret" };
const id = "b2b0d2c6-1f4e-4a90-9a1e-2c9a4a7f0f11";
const sale = {
  transaction_id: id,
  catalog_item_id: 123,
  amount: "0.001",
  dq: "synthetic",
  settled_at: "2026-10-18T04:00:00Z",
  dispatch_status: "pending",
};
const token = { access_token: "synthetic-seller-token", expires_at: 3600 };
it("uses account API credentials rather than an agent token to verify settled sales", async () => {
  const fetchImpl = vi.fn<typeof fetch>(async (_url, init) => Response.json(init?.method === "POST" ? token : { purchase: sale }));
  const client = createQatomPurchaseVerifier(config, { fetchImpl }, () => 0);
  expect(await client.purchase(id, "trace")).toEqual(sale);
  expect(fetchImpl.mock.calls[0]?.[0]).toBe("https://pay.m.todaq.net/v4/account/oauth/token");
  expect(new Headers(fetchImpl.mock.calls[0]?.[1]?.headers).get("authorization")).toBe(
    `Basic ${Buffer.from("seller-synthetic:synthetic-secret").toString("base64")}`,
  );
  expect(fetchImpl.mock.calls[1]?.[0]).toBe(`https://pay.m.todaq.net/v4/catalog/purchases/${id}`);
  expect(new Headers(fetchImpl.mock.calls[1]?.[1]?.headers).get("authorization")).toBe("Bearer synthetic-seller-token");
});
it("coalesces concurrent authentication and refreshes against the absolute expiry", async () => {
  let now = 0;
  const fetchImpl = vi.fn<typeof fetch>(async (_url, init) =>
    Response.json(init?.method === "POST" ? { ...token, expires_at: now / 1000 + 3600 } : { purchase: sale }),
  );
  const client = createQatomPurchaseVerifier(config, { fetchImpl }, () => now);
  await Promise.all([client.purchase(id, "a"), client.purchase(id, "b")]);
  expect(fetchImpl.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  now = 3_540_000;
  await client.purchase(id, "c");
  expect(fetchImpl.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(2);
});
it.each([429, 500])("retries idempotent sale verification after HTTP %i", async (status) => {
  let gets = 0;
  const fetchImpl = vi.fn<typeof fetch>(async (_url, init) =>
    init?.method === "POST" ? Response.json(token) : ++gets === 1 ? Response.json({}, { status }) : Response.json({ purchase: sale }),
  );
  expect(await createQatomPurchaseVerifier(config, { fetchImpl, sleep: async () => {} }, () => 0).purchase(id, "trace")).toEqual(sale);
  expect(gets).toBe(2);
});
it.each([401, 429, 500])("fails closed without retrying a seller token POST after HTTP %i", async (status) => {
  const fetchImpl = vi.fn<typeof fetch>(async () => Response.json({}, { status }));
  await expect(createQatomPurchaseVerifier(config, { fetchImpl }, () => 0).purchase(id, "trace")).rejects.toThrow();
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});
it.each([{ access_token: "synthetic", expires_at: 0 }, { access_token: "synthetic", expires_at: 1 }, {}])(
  "rejects invalid or already expired account tokens",
  async (body) => {
    const fetchImpl = vi.fn<typeof fetch>(async () => Response.json(body));
    await expect(createQatomPurchaseVerifier(config, { fetchImpl }, () => 1000).purchase(id, "trace")).rejects.toThrow();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  },
);
it("does not use malformed settled-sale data", async () => {
  const fetchImpl = vi.fn<typeof fetch>(async (_url, init) =>
    Response.json(init?.method === "POST" ? token : { purchase: { ...sale, amount: "1.000" } }),
  );
  await expect(createQatomPurchaseVerifier(config, { fetchImpl }, () => 0).purchase(id, "trace")).rejects.toThrow();
});
it("bounds stalled requests and releases a failed authentication exchange", async () => {
  let stalled = true;
  const fetchImpl = vi.fn<typeof fetch>(async (_url, init) => {
    if (stalled)
      return new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true }));
    return Response.json(init?.method === "POST" ? token : { purchase: sale });
  });
  const client = createQatomPurchaseVerifier(config, { fetchImpl, timeoutMs: 10 }, () => 0);
  await expect(client.purchase(id, "trace")).rejects.toMatchObject({ kind: "timeout" });
  stalled = false;
  expect(await client.purchase(id, "retry")).toEqual(sale);
});
