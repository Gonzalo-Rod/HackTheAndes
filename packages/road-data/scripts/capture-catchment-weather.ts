import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import { weatherKindSchema } from "../src/contracts/catchment-weather.ts";
import { createPrecipitationProvider } from "../src/integrations/open-meteo/precipitation.ts";
import { createFetchJsonTransport } from "../src/integrations/http/json-transport.ts";
import { prepareCatchmentWeather } from "../src/services/prepare-catchment-weather.ts";
import { readWeatherFile, writeWeatherFile } from "../src/integrations/open-meteo/weather-files.ts";
import { summarizeOperationalWeather } from "../src/domain/weather/aggregate.ts";
const args = process.argv.slice(2);
const kind = weatherKindSchema.parse(args[0] ?? "operational");
const startDate = args[1];
const endDate = args[2];
if (kind !== "operational") {
  z.iso.date().parse(startDate);
  z.iso.date().parse(endDate);
}
if (args.length > (kind === "operational" ? 1 : 3))
  throw new Error(
    "Usage: weather:capture -- [operational | previous_runs START END | reanalysis START END]",
  );
const now = new Date();
const requestId = randomUUID();
const output = new URL(
  `../data/weather/${kind === "operational" ? "live" : `${kind}-${startDate}-${endDate}`}.json.gz`,
  import.meta.url,
);
try {
  const catchments: unknown = JSON.parse(
    await readFile(new URL("../data/pe22/catchments.json", import.meta.url), "utf8"),
  );
  const samplePlan =
    kind === "operational"
      ? undefined
      : await readWeatherFile(new URL("../data/weather/live.json.gz", import.meta.url));
  const capture = await prepareCatchmentWeather({
    catchments,
    provider: createPrecipitationProvider(
      createFetchJsonTransport({ timeoutMs: kind === "operational" ? 8_000 : 120_000 }),
    ),
    query: { kind, startDate, endDate },
    requestId,
    now,
    samplePlan,
  });
  await writeWeatherFile(output, capture);
  const summary =
    kind === "operational" ? summarizeOperationalWeather(capture, now.getTime()) : null;
  console.log(
    JSON.stringify({
      state: "stored",
      kind,
      grids: capture.grids.length,
      catchments: capture.catchments.length,
      forecastIssuedAt: capture.forecastIssuedAt,
      coverage: capture.grids.map((g) => ({
        gridId: g.id,
        hours: g.timesUtc.length,
        known: Object.fromEntries(
          Object.entries(g.values).map(([name, values]) => [
            name,
            values?.filter((v) => v !== null).length,
          ]),
        ),
      })),
      summary,
    }),
  );
} catch (error) {
  console.error(
    JSON.stringify({
      requestId,
      operation: "weather.capture",
      provider: "open-meteo",
      result: "failure",
      errorType: error instanceof Error ? error.name : "UnknownError",
    }),
  );
  console.log(
    JSON.stringify({
      state: "unavailable",
      message: "Capture failed; existing validated data was not replaced.",
    }),
  );
  process.exitCode = 1;
}
