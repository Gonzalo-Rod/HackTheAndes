import { createHash } from "node:crypto";
import { exposureRecordSchema, type ExposureRecord } from "../../contracts/exposure-input.ts";
import { exposureAssessmentSchema } from "../../contracts/exposure.ts";
import { calculateExposure } from "./assessment.ts";
export function exposureHash(input: unknown): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}
export function exposureIdentity(
  input: ExposureRecord["input"],
  policy: ExposureRecord["assessment"]["policy"],
) {
  return exposureHash({ inputSha256: exposureHash(input), policySha256: exposureHash(policy) });
}
/** Database and bundled JSON must reproduce exactly from their stored numerical inputs. */
export function validateExposureRecord(value: unknown): ExposureRecord {
  const record = exposureRecordSchema.parse(value);
  const { assessment, input } = record;
  if (input.sourceHashes.weather !== exposureHash(input.weather))
    throw new Error("Exposure weather source hash mismatch");
  if (
    assessment.assessmentId !== exposureIdentity(input, assessment.policy) ||
    assessment.policySha256 !== exposureHash(assessment.policy)
  )
    throw new Error("Exposure record content identity mismatch");
  const expected = exposureAssessmentSchema.parse(
    calculateExposure(input, assessment.policy, {
      assessmentId: assessment.assessmentId,
      policySha256: assessment.policySha256,
      assessedAt: assessment.assessedAt,
    }),
  );
  if (JSON.stringify(expected) !== JSON.stringify(assessment))
    throw new Error("Exposure record does not reproduce from stored inputs");
  return record;
}
