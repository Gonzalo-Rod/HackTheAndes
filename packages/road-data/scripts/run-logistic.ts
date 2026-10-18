import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { z } from "zod";
import { prepareTraining } from "../src/services/prepare-training.ts";
import { writeJson, readValidatedJson } from "../src/integrations/training/files.ts";
import {
  trainingDatasetSchema,
  trainingPolicySchema,
  logisticArtifactSchema,
} from "../src/contracts/logistic-training.ts";
import { trainingReportSchema } from "../src/contracts/training-report.ts";
const execute = promisify(execFile);
// Operator budget: bound local fitting; Python is never part of the deployed request path.
const TRAINING_TIMEOUT_MS = 120_000;
const args = process.argv.slice(2);
const operation = z.enum(["train", "evaluate"]).parse(args.shift());
let horizonHours: 6 | 24 | 72 = 24,
  artifactPath: string | undefined;
while (args.length) {
  const option = args.shift(),
    value = args.shift();
  if (option === "--horizon")
    horizonHours = z
      .enum(["6", "24", "72"])
      .transform((v) => Number(v) as 6 | 24 | 72)
      .parse(value);
  else if (option === "--artifact" && value) artifactPath = resolve(value);
  else
    throw new Error(
      "Usage: ml:train -- [--horizon 6|24|72]; ml:evaluate -- --artifact PATH [--horizon 6|24|72]",
    );
}
if (operation === "evaluate" && !artifactPath)
  throw new Error("Evaluation requires --artifact from a completed training run");
if (operation === "train" && artifactPath)
  throw new Error("Training never consumes a previous model artifact");
const createdAt = new Date().toISOString();
const directory = new URL(
  `../data/.cache/ml/runs/${createdAt.replaceAll(":", "-")}-${randomUUID()}/`,
  import.meta.url,
);
try {
  const result = await prepareTraining();
  await writeJson(new URL("dataset.json", directory), result.dataset);
  await writeJson(new URL("policy.json", directory), result.policy);
  await writeJson(new URL("schemas.json", directory), {
    dataset: z.toJSONSchema(trainingDatasetSchema),
    policy: z.toJSONSchema(trainingPolicySchema),
    artifact: z.toJSONSchema(logisticArtifactSchema),
    report: z.toJSONSchema(trainingReportSchema),
  });
  const pythonArgs = [
    fileURLToPath(new URL("../python/train_logistic.py", import.meta.url)),
    operation,
    "--directory",
    fileURLToPath(directory),
    "--horizon",
    String(horizonHours),
    "--created-at",
    createdAt,
  ];
  if (artifactPath) pythonArgs.push("--artifact", artifactPath);
  try {
    await execute(fileURLToPath(new URL("../.venv/bin/python", import.meta.url)), pythonArgs, {
      timeout: TRAINING_TIMEOUT_MS,
      maxBuffer: 1024 * 1024,
    });
  } catch (error) {
    // Exit 2 is an expected scientific-readiness result, with a validated report to read below.
    const exit = z.object({ code: z.literal(2) }).safeParse(error);
    if (!exit.success)
      throw new Error("Offline trainer failed; verify Python dependencies and validated inputs", {
        cause: error,
      });
  }
  const report = await readValidatedJson(new URL("report.json", directory), trainingReportSchema);
  if (report.status === "blocked") {
    if (!result.dataset.rows.length) report.blockers.push("no_as_of_verified_labeled_feature_rows");
    if (!result.audit.verifiedNonEventWindows)
      report.blockers.push("no_verified_non_event_monitoring_windows");
    await writeJson(new URL("report.json", directory), report);
  }
  if (operation === "train" && report.status === "trained_experimental")
    await readValidatedJson(new URL("model.json", directory), logisticArtifactSchema);
  console.log(
    JSON.stringify({
      state: report.status,
      horizonHours,
      blockers: report.blockers,
      report: fileURLToPath(new URL("report.json", directory)),
      model:
        report.status === "trained_experimental"
          ? fileURLToPath(new URL("model.json", directory))
          : null,
    }),
  );
  if (report.status === "blocked") process.exitCode = 2;
} catch (error) {
  console.error(
    JSON.stringify({
      state: "training_failed",
      errorType: error instanceof Error ? error.name : "UnknownError",
      message:
        "No deployable model was produced. Validate source review, as-of evidence and the offline Python environment.",
    }),
  );
  process.exitCode = 1;
}
