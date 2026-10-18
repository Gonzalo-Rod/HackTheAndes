// Builds src/integrations/local-data/national-rain-grid.json: coarse cell centers inside Peru used
// for the national rain layer (run: node scripts/build-national-rain-grid.ts).
import fs from "node:fs/promises";
import { z } from "zod";
import { gridCentersInside, type PolygonRings } from "../src/domain/weather/national-grid";

/** 0.75° cells (~83 km) keep hourly Open-Meteo use near 4,500 location calls a day. */
const STEP_DEG = 0.75;
const PERU_BBOX = [-81.5, -18.5, -68.5, 0.1] as const;
/** Display cells (~28 km) interpolated from the model cells; no extra provider calls. */
const DISPLAY_STEP_DEG = 0.25;

async function main() {
  const position = z.tuple([z.number(), z.number()]);
  const regions = z
    .object({
      features: z.array(
        z.object({
          geometry: z.discriminatedUnion("type", [
            z.object({ type: z.literal("Polygon"), coordinates: z.array(z.array(position)) }),
            z.object({ type: z.literal("MultiPolygon"), coordinates: z.array(z.array(z.array(position))) }),
          ]),
        }),
      ),
    })
    .parse(JSON.parse(await fs.readFile("public/data/regiones.geojson", "utf8")));
  const polygons: PolygonRings[] = regions.features.flatMap(({ geometry }) =>
    geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates,
  );
  const centers = gridCentersInside(polygons, PERU_BBOX, STEP_DEG);
  const displayCenters = gridCentersInside(polygons, PERU_BBOX, DISPLAY_STEP_DEG);
  await fs.writeFile(
    "src/integrations/local-data/national-rain-grid.json",
    `${JSON.stringify({
      stepDeg: STEP_DEG,
      displayStepDeg: DISPLAY_STEP_DEG,
      source: "public/data/regiones.geojson",
      centers,
      displayCenters,
    })}\n`,
  );
  console.log(JSON.stringify({ state: "built", cells: centers.length, displayCells: displayCenters.length }));
}

main().catch((error: unknown) => {
  console.error(JSON.stringify({ state: "failed", message: error instanceof Error ? error.message : String(error) }));
  process.exitCode = 1;
});
