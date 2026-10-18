import { expect, it } from "vitest";
import { parseQatomCheckoutOutput } from "./checkout-output";

const checkout = {
  name: "PeruRoad Climate: WhatsApp alerts for 7 days",
  description: "Seven-day pass",
  price: 0.001,
  checkout_url: "https://checkout.m.todaq.net/checkout/synthetic",
};
const receipt = `Checkout session created for "${checkout.name}"\nPrice: $0.001 USD\nURL: ${checkout.checkout_url}`;

it.each([receipt, receipt.replaceAll("\n", "\r\n"), `\n${receipt}\n`, receipt.replace(" USD\n", " USD-TDN\n")])(
  "parses a provider text receipt with its exact price and trusted checkout domain",
  (text) => expect(parseQatomCheckoutOutput(text)).toBe(checkout.checkout_url),
);
it.each([
  checkout,
  JSON.stringify(checkout),
  { structuredContent: checkout, content: [] },
  { content: [{ type: "text", text: JSON.stringify(checkout) }] },
  { content: [{ type: "text", text: receipt }] },
])("preserves validated JSON and MCP-envelope compatibility", (value) =>
  expect(parseQatomCheckoutOutput(value)).toBe(checkout.checkout_url),
);
it.each([
  receipt.replace("$0.001", "$0.01"),
  receipt.replace(" USD\n", " PEN\n"),
  receipt.replace("https://checkout.m.todaq.net", "https://evil.example"),
  receipt.replace("https://checkout.m.todaq.net", "https://checkout.m.todaq.net.evil.example"),
  receipt.replace("https://checkout.m.todaq.net", "https://user:password@checkout.m.todaq.net"),
  receipt.replace("https://checkout.m.todaq.net", "http://checkout.m.todaq.net"),
  receipt.replace("Price: $0.001 USD\n", ""),
  `${receipt}\nURL: https://checkout.m.todaq.net/checkout/other`,
  `Pay here: ${checkout.checkout_url}`,
  "Not JSON and not a Qatom receipt",
  { isError: true, content: [{ type: "text", text: receipt }] },
  { structuredContent: { ...checkout, price: 1 }, content: [{ type: "text", text: receipt }] },
])("rejects wrong prices, malformed output, tool errors and untrusted links", (value) =>
  expect(() => parseQatomCheckoutOutput(value)).toThrow(),
);
