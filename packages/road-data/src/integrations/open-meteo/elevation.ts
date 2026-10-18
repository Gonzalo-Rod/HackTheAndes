import { z } from "zod";
import { positionSchema, type Position } from "../../contracts/road-geometry.ts";
import {
  elevationValueSchema,
  MAX_ELEVATION_SAMPLES,
  type ElevationProvider,
} from "../../contracts/road-elevation.ts";
import type { JsonTransport } from "../http/json-transport.ts";

export const ELEVATION_URL = "https://api.open-meteo.com/v1/elevation";
// Open-Meteo documents a maximum of 100 coordinates per elevation request.
const MAX_POINTS_PER_REQUEST = 100;
const responseSchema = z.object({ elevation: z.array(elevationValueSchema) });

export class ElevationPayloadError extends Error {
  constructor() {
    super("Elevation response is invalid or does not match the requested coordinates");
    this.name = "ElevationPayloadError";
  }
}

export function createOpenMeteoElevationProvider({
  transport,
}: {
  transport: JsonTransport;
}): ElevationProvider {
  return {
    source: {
      provider: "open-meteo",
      dataset: "copernicus-dem-2021-glo90",
      spatialResolutionM: 90,
      attribution: "Copernicus DEM GLO-90 (2021), served by Open-Meteo",
      documentationUrl: "https://open-meteo.com/en/docs/elevation-api",
    },
    async fetchElevations(input, options = {}) {
      const positions: Position[] = z.array(positionSchema).max(MAX_ELEVATION_SAMPLES).parse(input);
      const values: number[] = [];
      const sourceUrls: string[] = [];
      for (let index = 0; index < positions.length; index += MAX_POINTS_PER_REQUEST) {
        const batch = positions.slice(index, index + MAX_POINTS_PER_REQUEST);
        const url = new URL(ELEVATION_URL);
        url.searchParams.set("latitude", batch.map((point) => point[1]).join(","));
        url.searchParams.set("longitude", batch.map((point) => point[0]).join(","));
        const payload = await transport.getJson(url.href, {
          ...options,
          provider: "open-meteo-elevation",
        });
        const parsed = responseSchema.safeParse(payload);
        if (!parsed.success || parsed.data.elevation.length !== batch.length)
          throw new ElevationPayloadError();
        values.push(...parsed.data.elevation);
        sourceUrls.push(url.href);
      }
      return { values, sourceUrls };
    },
  };
}
