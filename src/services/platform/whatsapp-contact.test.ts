import { afterEach, expect, it, vi } from "vitest";
import { readWhatsAppContact } from "./dashboard";

const request = () => new Request("https://example.test/api/whatsapp");
afterEach(() => vi.unstubAllEnvs());

it("returns the configured bot number as digits only", async () => {
  vi.stubEnv("WHATSAPP_BOT_NUMBER", "+51 900 000 000");
  const response = await readWhatsAppContact(request());
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ number: "51900000000" });
});

it("answers 503 without a number so the dashboard hides its WhatsApp buttons", async () => {
  vi.stubEnv("WHATSAPP_BOT_NUMBER", "");
  const response = await readWhatsAppContact(request());
  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({ error: { code: "whatsapp_unavailable" } });
});

it("rejects a malformed number without echoing it", async () => {
  vi.stubEnv("WHATSAPP_BOT_NUMBER", "call-me-maybe");
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  const response = await readWhatsAppContact(request());
  expect(response.status).toBeGreaterThanOrEqual(500);
  expect(await response.text()).not.toContain("call-me-maybe");
});
