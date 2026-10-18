import { expect, it, vi } from "vitest";
import { createOpenAiQatomCheckout } from "./qatom-checkout";
const requestId = "abcdef12-0000-4000-8000-000000000000";
const checkout = {
  name: "Weekly alerts",
  description: "Seven days",
  price: 0.01,
  checkout_url: "https://checkout.m.todaq.net/checkout/synthetic",
};
function body(overrides: Record<string, unknown> = {}) {
  return {
    status: "completed",
    output: [
      {
        type: "mcp_call",
        name: "guest_checkout",
        server_label: "qatom",
        arguments: JSON.stringify({ catalog_item_id: 123, arguments: { request_id: requestId } }),
        output: JSON.stringify(checkout),
        error: null,
        ...overrides,
      },
    ],
  };
}
function setup(fetchImpl: typeof fetch) {
  return createOpenAiQatomCheckout(
    {
      apiKey: "synthetic-key",
      model: "synthetic-model",
      mcpUrl: "https://synthetic.mcp.m.todaq.net",
      itemId: 123,
      accessToken: async () => "synthetic-access",
    },
    { fetchImpl, timeoutMs: 10 },
  );
}
it("uses Responses API with only guest_checkout and never sends a phone number or raw user text", async () => {
  const fetchImpl = vi.fn<typeof fetch>(async () => Response.json(body()));
  expect(await setup(fetchImpl).create(requestId, "trace")).toBe(checkout.checkout_url);
  const init = fetchImpl.mock.calls[0]?.[1];
  const sent = JSON.parse(String(init?.body));
  expect(sent.store).toBe(false);
  expect(sent.tools[0]).toMatchObject({ type: "mcp", allowed_tools: ["guest_checkout"], authorization: "synthetic-access" });
  expect(sent.max_tool_calls).toBe(1);
  expect(sent.input).toBe(JSON.stringify({ catalog_item_id: 123, arguments: { request_id: requestId } }));
});
it.each([
  { name: "agent_checkout" },
  { error: { message: "failed" } },
  { arguments: JSON.stringify({ catalog_item_id: 124, arguments: { request_id: requestId } }) },
  { arguments: JSON.stringify({ catalog_item_id: 123, arguments: { request_id: "abcdef12-0000-4000-8000-000000000001" } }) },
  { output: JSON.stringify({ ...checkout, price: 0.001 }) },
  { output: JSON.stringify({ ...checkout, checkout_url: "https://evil.example/checkout" }) },
  { output: JSON.stringify({ ...checkout, checkout_url: "https://pay.m.todaq.net.evil.example/checkout" }) },
])("rejects changed calls, failed tools, changed prices and unsafe links: %j", async (overrides) => {
  await expect(setup(async () => Response.json(body(overrides))).create(requestId, "trace")).rejects.toThrow();
});
it("accepts structured MCP tool output", async () => {
  const provider = setup(async () => Response.json(body({ output: JSON.stringify({ structuredContent: checkout, content: [] }) })));
  expect(await provider.create(requestId, "trace")).toBe(checkout.checkout_url);
});
it.each([429, 500])("does not retry the billable Responses POST after HTTP %i", async (status) => {
  const fetchImpl = vi.fn<typeof fetch>(async () => Response.json({}, { status }));
  await expect(setup(fetchImpl).create(requestId, "trace")).rejects.toThrow();
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});
it("bounds a stalled Responses request", async () => {
  const fetchImpl: typeof fetch = async (_url, init) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    });
  await expect(setup(fetchImpl).create(requestId, "trace")).rejects.toMatchObject({ kind: "timeout" });
});

it("accepts the live Qatom receipt from the MCP call while ignoring assistant prose", async () => {
  const receipt = `Checkout session created for "Weekly alerts"\nPrice: $0.01 USD\nURL: ${checkout.checkout_url}`;
  const response = body({ output: receipt });
  response.output.push({
    type: "message",
    name: "ignored",
    server_label: "ignored",
    arguments: "",
    output: "Use https://evil.example",
    error: null,
  });
  expect(await setup(async () => Response.json(response)).create(requestId, "trace")).toBe(checkout.checkout_url);
});
