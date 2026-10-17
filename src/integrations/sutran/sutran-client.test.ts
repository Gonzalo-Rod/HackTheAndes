import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SUTRAN_ALERT_PE22, sutranEnvelope } from "@/test/fixtures/sutran";

import { createSutranClient } from "./sutran-client";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const sleep = async () => undefined;

function clientWith(...responses: Response[]) {
  const fetchImpl = vi.fn();
  for (const response of responses) fetchImpl.mockResolvedValueOnce(response);
  return { client: createSutranClient({ baseUrl: "https://sutran.test/public/", fetchImpl, sleep }), fetchImpl };
}

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

describe("SUTRAN client", () => {
  it("lists alerts and requests the documented endpoint", async () => {
    const { client, fetchImpl } = clientWith(json(sutranEnvelope([SUTRAN_ALERT_PE22])));
    const result = await client.listAlerts({});
    expect(result.records).toHaveLength(1);
    expect(result.invalidCount).toBe(0);
    expect(fetchImpl.mock.calls[0][0]).toBe("https://sutran.test/public/alerts");
  });

  it("handles an empty response", async () => {
    const { client } = clientWith(json(sutranEnvelope([])));
    await expect(client.listAlerts({})).resolves.toEqual({ records: [], invalidCount: 0 });
  });

  it("skips records that changed shape and counts them", async () => {
    const changed = { ...SUTRAN_ALERT_PE22, id: 42, lat: "-11.9" };
    const { client } = clientWith(json(sutranEnvelope([SUTRAN_ALERT_PE22, changed])));
    const result = await client.listAlerts({});
    expect(result.records).toHaveLength(1);
    expect(result.invalidCount).toBe(1);
  });

  it("rejects an envelope that is not the documented shape", async () => {
    const { client } = clientWith(json({ items: [] }));
    await expect(client.listAlerts({})).rejects.toMatchObject({ kind: "invalid_body", provider: "sutran" });
  });

  it("rejects success: false", async () => {
    const { client } = clientWith(json({ success: false, data: [] }));
    await expect(client.listAlerts({})).rejects.toMatchObject({ kind: "invalid_body" });
  });

  it("retries a 500 and a 429 before succeeding", async () => {
    const { client, fetchImpl } = clientWith(json({}, 500), json({}, 429), json(sutranEnvelope([SUTRAN_ALERT_PE22])));
    await expect(client.listAlerts({})).resolves.toMatchObject({ invalidCount: 0 });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("surfaces a 404 for a missing alert detail", async () => {
    const { client } = clientWith(json({ success: false, errorCode: "NOT_FOUND" }, 404));
    await expect(client.getAlertDetail("x", {})).rejects.toMatchObject({ kind: "http", status: 404 });
  });

  it("parses detail extras and history", async () => {
    const { client } = clientWith(
      json(sutranEnvelope({ id: "a", submotivoLabel: "Otros", etiquetasLabels: ["", "Huaico"], evidencia: [{ tipo: "foto", url: "https://c.test/1.jpg" }, 5] })),
      json(sutranEnvelope([{ fecha: "2026-10-17T15:21:32.269Z", tipo: "publicacion", estadoNuevo: null }])),
    );
    await expect(client.getAlertDetail("a", {})).resolves.toEqual({
      subcauseLabel: "Otros",
      tags: ["Huaico"],
      evidence: [{ tipo: "foto", url: "https://c.test/1.jpg" }],
    });
    await expect(client.getAlertHistory("a", {})).resolves.toHaveLength(1);
  });
});
