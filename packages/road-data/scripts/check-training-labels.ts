import { writeLabelAudit } from "../src/services/prepare-training.ts";
if (process.argv.slice(2).some((a) => a !== "--verify"))
  throw new Error("Usage: ml:labels:check -- [--verify]");
const result = await writeLabelAudit(process.argv.includes("--verify"));
console.log(
  JSON.stringify({
    state: "reviewed",
    ...result.counts,
    verifiedNonEventWindows: result.verifiedNonEventWindows,
  }),
);
