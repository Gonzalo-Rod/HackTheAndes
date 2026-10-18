import { z } from "zod";
import type { AlertPassCheckout } from "@/contracts/alert-passes";
import { alertPassInputSchema, checkoutUrlSchema } from "@/contracts/alert-passes";
import { postJson, type RequestOptions } from "@/integrations/http/fetch-json";

const callSchema = z.object({
  type: z.literal("mcp_call"),
  name: z.literal("guest_checkout"),
  server_label: z.literal("qatom"),
  arguments: z.string(),
  output: z.string(),
  error: z.null().optional(),
});
const checkoutSchema = z.object({ name: z.string(), description: z.string(), price: z.literal(0.001), checkout_url: checkoutUrlSchema });
function parseCheckout(value: unknown): z.infer<typeof checkoutSchema> {
  const direct = checkoutSchema.safeParse(value);
  if (direct.success) return direct.data;
  const result = z
    .object({
      isError: z.boolean().optional(),
      structuredContent: z.unknown().optional(),
      content: z.array(z.object({ type: z.string(), text: z.string().optional() })).optional(),
    })
    .parse(value);
  if (result.isError) throw new Error("Qatom checkout unavailable");
  if (result.structuredContent) return checkoutSchema.parse(result.structuredContent);
  const text = result.content?.find((item) => item.type === "text")?.text;
  if (!text) throw new Error("Missing Qatom checkout output");
  return checkoutSchema.parse(JSON.parse(text) as unknown);
}
export function createOpenAiQatomCheckout(
  config: {
    apiKey: string;
    model: string;
    mcpUrl: string;
    itemId: number;
    accessToken: (traceId: string) => Promise<string>;
  },
  options: Pick<RequestOptions, "fetchImpl" | "sleep" | "timeoutMs"> = {},
): AlertPassCheckout {
  return {
    async create(requestId, traceId) {
      const args = { catalog_item_id: config.itemId, arguments: alertPassInputSchema.parse({ request_id: requestId }) };
      const result = await postJson(
        "https://api.openai.com/v1/responses",
        {
          model: config.model,
          store: false,
          max_output_tokens: 800,
          max_tool_calls: 1,
          parallel_tool_calls: false,
          instructions:
            "Call Qatom guest_checkout exactly once with the supplied JSON arguments. Create a payment link only. Never pay, transfer funds, substitute items or change arguments. Return the tool result.",
          input: JSON.stringify(args),
          tools: [
            {
              type: "mcp",
              server_label: "qatom",
              server_url: config.mcpUrl,
              authorization: await config.accessToken(traceId),
              allowed_tools: ["guest_checkout"],
              // This tool only prepares a link. The driver authorizes payment on Qatom itself.
              require_approval: "never",
            },
          ],
          tool_choice: { type: "mcp", server_label: "qatom", name: "guest_checkout" },
        },
        {
          ...options,
          provider: "openai",
          operation: "qatom.checkout",
          requestId: traceId,
          timeoutMs: options.timeoutMs ?? 45_000,
          headers: { Authorization: `Bearer ${config.apiKey}` },
          idempotent: false,
        },
      );
      const response = z
        .object({ status: z.literal("completed"), output: z.array(z.object({ type: z.string() }).passthrough()) })
        .parse(result.body);
      const calls = response.output.filter((item) => item.type === "mcp_call");
      if (calls.length !== 1 || response.output.some((item) => item.type === "mcp_approval_request"))
        throw new Error("Unexpected Qatom checkout calls");
      const call = callSchema.parse(calls[0]);
      const supplied = z
        .object({ catalog_item_id: z.literal(config.itemId), arguments: alertPassInputSchema })
        .strict()
        .parse(JSON.parse(call.arguments) as unknown);
      if (supplied.arguments.request_id !== requestId) throw new Error("Checkout request mismatch");
      return parseCheckout(JSON.parse(call.output) as unknown).checkout_url;
    },
  };
}
