import { expect, it } from "vitest";
import { createPrecipitationProvider } from "../../src/integrations/open-meteo/precipitation.ts";
import { createFetchJsonTransport } from "../../src/integrations/http/json-transport.ts";
const location = {
  latitude: -12,
  longitude: -77,
  elevation: 100,
  utc_offset_seconds: 0,
  hourly_units: { time: "unixtime", precipitation: "mm" },
  hourly: { time: [0, 3600], precipitation: [0, null] },
};
it("validates counts and units while preserving unavailable hours", async () => {
  let requested = "";
  const provider = createPrecipitationProvider({
    getJson: async (url) => {
      requested = url;
      return [location, location];
    },
  });
  const result = await provider.fetchWeather(
    [
      [-77, -12],
      [-77, -12],
    ],
    { kind: "operational" },
    "test",
  );
  expect(result.series[0]?.values.precipitation).toEqual([0, null]);
  expect(new URL(requested).searchParams.get("elevation")).toBe("nan,nan");
  const bad = createPrecipitationProvider({
    getJson: async () => ({
      ...location,
      hourly_units: { time: "unixtime", precipitation: "inches" },
    }),
  });
  await expect(bad.fetchWeather([[-77, -12]], { kind: "operational" }, "test")).rejects.toThrow(
    "units",
  );
});
it.each([429, 500])("retries provider HTTP %s through the shared wrapper", async (status) => {
  let attempts = 0;
  const provider = createPrecipitationProvider(
    createFetchJsonTransport({
      fetch: async () => {
        attempts++;
        return attempts < 3 ? new Response("unavailable", { status }) : Response.json(location);
      },
      sleep: async () => {},
      logger: () => {},
    }),
  );
  expect(
    (await provider.fetchWeather([[-77, -12]], { kind: "operational" }, "test")).series,
  ).toHaveLength(1);
  expect(attempts).toBe(3);
});
it("stops after the timeout retry budget", async () => {
  let attempts = 0;
  const provider = createPrecipitationProvider(
    createFetchJsonTransport({
      timeoutMs: 5,
      fetch: async (_url, options) => {
        attempts++;
        return new Promise((_resolve, reject) =>
          options?.signal?.addEventListener("abort", () => reject(options.signal?.reason), {
            once: true,
          }),
        );
      },
      sleep: async () => {},
      logger: () => {},
    }),
  );
  await expect(
    provider.fetchWeather([[-77, -12]], { kind: "operational" }, "test"),
  ).rejects.toMatchObject({ kind: "timeout" });
  expect(attempts).toBe(3);
});
