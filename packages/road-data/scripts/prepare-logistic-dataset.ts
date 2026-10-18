import { prepareTraining } from "../src/services/prepare-training.ts";
import { writeJson } from "../src/integrations/training/files.ts";
const result = await prepareTraining();
const directory = new URL("../data/.cache/ml/", import.meta.url);
await writeJson(new URL("dataset.json", directory), result.dataset);
await writeJson(new URL("nominal-features.json", directory), result.nominal);
await writeJson(new URL("preparation-report.json", directory), {
  counts: result.audit.counts,
  eligibleRows: result.dataset.rows.length,
  verifiedNonEventWindows: result.audit.verifiedNonEventWindows,
  excludedObservations: result.excluded,
  nominalFeatureRows: result.nominal.length,
  nominalFeaturesAreTrainingEligible: false,
  sourceHashes: result.sourceHashes,
});
console.log(
  JSON.stringify({
    state: "prepared",
    eligibleRows: result.dataset.rows.length,
    verifiedNonEventWindows: result.audit.verifiedNonEventWindows,
    nominalFeatureRows: result.nominal.length,
    output: "data/.cache/ml/",
  }),
);
