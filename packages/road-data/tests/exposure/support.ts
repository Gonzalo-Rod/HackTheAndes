import { loadBundledExposureSources } from "../../src/integrations/exposure/files.ts";
import { prepareExposure } from "../../src/services/prepare-exposure.ts";
export async function capturedExposure() {
  const sources = await loadBundledExposureSources();
  const at = new Date(
    Math.max(
      Date.parse(sources.weather.capturedAt),
      Date.parse(sources.hazards.capturedAt),
      Date.parse(sources.catchments.preparedAt),
    ) + 1000,
  ).toISOString();
  const result = prepareExposure(sources, at);
  if (!result.ok) throw new Error(result.error.message);
  return { sources, record: result.value, at };
}
