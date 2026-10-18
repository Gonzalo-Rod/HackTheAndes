import { prepareExposure } from "../src/services/prepare-exposure.ts";
import { createExposureView } from "../src/domain/exposure/view.ts";
import {
  loadBundledExposureSources,
  writeExposureRecord,
  readBundledExposure,
} from "../src/integrations/exposure/files.ts";
const args = process.argv.slice(2);
if (args.some((a) => a !== "--verify"))
  throw new Error("Usage: npm run exposure:prepare -- [--verify]");
const sources = await loadBundledExposureSources();
const existing = args.includes("--verify") ? await readBundledExposure() : null;
const result = prepareExposure(
  sources,
  existing?.assessment.assessedAt ?? new Date().toISOString(),
);
if (!result.ok) throw new Error(result.error.message);
if (existing && JSON.stringify(existing) !== JSON.stringify(result.value))
  throw new Error("Bundled exposure does not match source inputs");
if (!existing) await writeExposureRecord(result.value);
const view = createExposureView(result.value.assessment, Date.now(), "snapshot");
console.log(
  JSON.stringify({
    state: existing ? "verified" : "prepared",
    assessmentId: result.value.assessment.assessmentId,
    freshness: view.meta.state,
    catchments: view.data.catchments.length,
    segments: view.data.segments.length,
    assessedSegments: view.data.segments.filter((s) => s.windows.next24h.state === "assessed")
      .length,
    automatedAlertUse: false,
  }),
);
