import { z } from "zod";

export const jobRequestSchema = z.strictObject({
  requestId: z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/),
});
const count = z.number().int().nonnegative();
export const jobOutcomeSchema = z.object({
  requestId: jobRequestSchema.shape.requestId,
  status: z.enum(["running", "complete", "partial", "failure"]),
  counts: z
    .object({
      selected: count,
      inserted: count,
      updated: count,
      unchanged: count,
      historyInserted: count,
      failed: count,
      conflicts: count,
      sourceRejected: count,
    })
    .optional(),
  error: z.object({ code: z.string(), message: z.string() }).optional(),
});
export type JobOutcome = z.infer<typeof jobOutcomeSchema>;

export interface IngestionRunStore {
  /** Atomically reserve an execution ID; false means another call already reserved it. */
  reserve(requestId: string): Promise<boolean>;
  read(requestId: string): Promise<JobOutcome>;
  finish(outcome: JobOutcome): Promise<void>;
}

export interface JobLog {
  requestId: string;
  operation: "sutran.job" | "sutran.job.http";
  provider: "sutran";
  durationMs: number;
  result: string;
  errorType?: string;
}
