import { it, expect, vi } from "vitest";
import { createZavuTemplateSender } from "./templates";
const message = {
  to: "US.synthetic-contact",
  text: "SUTRAN: cambio de condición. BAJA cancela.",
  channel: "whatsapp" as const,
  idempotencyKey: "synthetic-alert",
};
const config = { apiKey: "synthetic", senderId: "synthetic", templateId: "template-id" };
it("keeps alerts pending when no approved template is configured", async () =>
  expect(await createZavuTemplateSender({ ...config, templateId: null }).sendTemplate(message)).toMatchObject({
    ok: false,
    error: "window_closed",
  }));
it("checks approval and sends a utility template without SMS fallback", async () => {
  const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
    if (init?.method === "GET") return Response.json({ id: "template-id", status: "approved" });
    const body = JSON.parse(String(init?.body));
    expect(body.messageType).toBe("template");
    expect(body.fallbackEnabled).toBe(false);
    expect(body.content.templateVariables["1"]).toContain("SUTRAN");
    return Response.json({ message: { id: "synthetic-accepted" } });
  });
  expect(await createZavuTemplateSender(config, fetcher).sendTemplate(message)).toMatchObject({ ok: true });
});
it("never sends an unapproved template", async () => {
  const f = vi.fn<typeof fetch>(async () => Response.json({ id: "template-id", status: "pending" }));
  expect(await createZavuTemplateSender(config, f).sendTemplate(message)).toMatchObject({ ok: false, error: "window_closed" });
  expect(f).toHaveBeenCalledOnce();
});
it("sends static weekly notices without invented body variables", async () => {
  const fetchImpl = vi.fn<typeof fetch>(async (_url, init) => {
    if (init?.method === "GET") return Response.json({ id: "template-id", status: "approved" });
    const body = JSON.parse(String(init?.body)) as { content: Record<string, unknown> };
    expect(body.content).toEqual({ templateId: "template-id" });
    return Response.json({ message: { id: "synthetic-weekly-notice" } });
  });
  expect(await createZavuTemplateSender({ ...config, summaryVariable: false }, fetchImpl).sendTemplate(message)).toMatchObject({
    ok: true,
  });
});
