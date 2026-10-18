import { z } from "zod";
import { ALERT_PASS_PRICE, checkoutUrlSchema } from "@/contracts/alert-passes";

const checkoutSchema = z.object({
  name: z.string(),
  description: z.string(),
  price: z.literal(Number(ALERT_PASS_PRICE)),
  checkout_url: checkoutUrlSchema,
});

function decodeCheckoutText(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    // Responses exposes Qatom's text receipt, even when its MCP tool declares structured output.
    // Match the entire provider receipt; never extract a URL from arbitrary model prose.
    const receipt = /^Checkout session created for "([^"\r\n]+)"\r?\nPrice: \$(\d+(?:\.\d+)?) USD(?:-TDN)?\r?\nURL: (\S+)$/.exec(
      text.trim(),
    );
    if (!receipt) throw new Error("Unrecognized Qatom checkout receipt");
    return { name: receipt[1], description: "", price: Number(receipt[2]), checkout_url: receipt[3] };
  }
}

export function parseQatomCheckoutOutput(value: unknown): string {
  const decoded = typeof value === "string" ? decodeCheckoutText(value) : value;
  const direct = checkoutSchema.safeParse(decoded);
  if (direct.success) return direct.data.checkout_url;
  const result = z
    .object({
      isError: z.boolean().optional(),
      structuredContent: z.unknown().optional(),
      content: z.array(z.object({ type: z.string(), text: z.string().optional() })).optional(),
    })
    .parse(decoded);
  if (result.isError) throw new Error("Qatom checkout unavailable");
  if (result.structuredContent !== undefined) return checkoutSchema.parse(result.structuredContent).checkout_url;
  const text = result.content?.find((item) => item.type === "text")?.text;
  if (!text) throw new Error("Missing Qatom checkout output");
  return checkoutSchema.parse(decodeCheckoutText(text)).checkout_url;
}
