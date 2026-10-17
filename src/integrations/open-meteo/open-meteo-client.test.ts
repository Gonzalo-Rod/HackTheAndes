import { describe, expect, it } from "vitest";

import { createOpenMeteoClient } from "./open-meteo-client";

const json = (body: unknown) => async () => new Response(JSON.stringify(body), { status: 200 });
const location = { hourly: { time: [1, 2], precipitation: [0.2, null] } };

describe("open-meteo client", () => {
  it("returns one hourly series per point", async () => {
    const client = createOpenMeteoClient({ baseUrl: "https://example.test/v1", fetchImpl: json([location, location]) as typeof fetch });
    const result = await client.fetchHourlyRain([
      { lat: -11.9, lng: -76.7 },
      { lat: -11.6, lng: -76.1 },
    ]);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ timesSec: [1, 2], precipitation: [0.2, null] });
  });

  it("accepts the single-object shape Open-Meteo returns for one point", async () => {
    const client = createOpenMeteoClient({ baseUrl: "https://example.test/v1", fetchImpl: json(location) as typeof fetch });
    expect(await client.fetchHourlyRain([{ lat: -11.9, lng: -76.7 }])).toHaveLength(1);
  });

  it("rejects a response whose length does not match the request", async () => {
    const client = createOpenMeteoClient({ baseUrl: "https://example.test/v1", fetchImpl: json([location]) as typeof fetch });
    await expect(
      client.fetchHourlyRain([
        { lat: -11.9, lng: -76.7 },
        { lat: -11.6, lng: -76.1 },
      ]),
    ).rejects.toMatchObject({ kind: "invalid_body" });
  });
  it("requests the next full 24 hours including the final hour-end timestamp", async () => {
    let requestedUrl = "";
    const client = createOpenMeteoClient({
      baseUrl: "https://example.test/v1",
      fetchImpl: (async (url) => {
        requestedUrl = String(url);
        return new Response(JSON.stringify(location));
      }) as typeof fetch,
    });
    await client.fetchHourlyRain([{ lat: -11.9, lng: -76.7 }]);
    expect(new URL(requestedUrl).searchParams.get("forecast_hours")).toBe("25");
  });

  it("rejects negative precipitation from the provider", async () => {
    const client = createOpenMeteoClient({
      baseUrl: "https://example.test/v1",
      fetchImpl: json({ hourly: { time: [1], precipitation: [-1] } }) as typeof fetch,
    });
    await expect(client.fetchHourlyRain([{ lat: -11.9, lng: -76.7 }])).rejects.toMatchObject({ kind: "invalid_body" });
  });
});
