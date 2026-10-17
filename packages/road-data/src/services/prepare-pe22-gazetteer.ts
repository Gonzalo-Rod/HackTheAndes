import { isDeepStrictEqual } from "node:util";
import {
  gazetteerSchema,
  type Gazetteer,
  type LandmarkProvider,
  type LocationResult,
} from "../contracts/road-locations.ts";
import { buildGazetteer } from "../domain/road-data/build-gazetteer.ts";
import { createRoadLocator } from "../domain/road-data/locate-road-position.ts";

export async function preparePe22Gazetteer({
  segments,
  provider,
  ...options
}: {
  segments: unknown;
  provider: LandmarkProvider;
  requestId?: string;
  signal?: AbortSignal;
}) {
  const geometry = createRoadLocator(segments);
  if (!geometry.ok) return geometry;
  return buildGazetteer(segments, await provider.fetchLandmarks(options));
}
export function validateGazetteerSnapshot(
  segments: unknown,
  input: unknown,
): LocationResult<Gazetteer> {
  const parsed = gazetteerSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error: { code: "invalid_snapshot", message: "Gazetteer snapshot failed validation" },
    };
  const rebuilt = buildGazetteer(segments, parsed.data.source);
  if (!rebuilt.ok) return rebuilt;
  if (!isDeepStrictEqual(rebuilt.value, parsed.data))
    return {
      ok: false,
      error: {
        code: "invalid_snapshot",
        message: "Gazetteer does not reproduce against current geometry and sources",
      },
    };
  return rebuilt;
}
