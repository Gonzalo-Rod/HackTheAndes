import { z } from "zod";

export const PassSchema = z.object({
  organizationId: z.uuid().nullable(),
  phoneKey: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .nullable(),
  plan: z.enum(["route_pass", "company_dashboard", "company_predictions"]),
  status: z.enum(["pending", "active", "expired", "cancelled"]),
  startsAt: z.iso.datetime({ offset: true }).nullable(),
  expiresAt: z.iso.datetime({ offset: true }).nullable(),
});
export type AccessPass = z.infer<typeof PassSchema>;
export type AccessSubject = { organizationId: string } | { phoneKey: string };
export type Feature = "dashboard" | "predictions" | "route_alerts";

export function activePass(passes: readonly AccessPass[], subject: AccessSubject, feature: Feature, nowMs: number): AccessPass | null {
  const allowed =
    feature === "route_alerts"
      ? ["route_pass"]
      : feature === "predictions"
        ? ["company_predictions"]
        : ["company_dashboard", "company_predictions"];
  return (
    passes.find((pass) => {
      const sameSubject = "organizationId" in subject ? pass.organizationId === subject.organizationId : pass.phoneKey === subject.phoneKey;
      return (
        sameSubject &&
        allowed.includes(pass.plan) &&
        pass.status === "active" &&
        pass.startsAt !== null &&
        pass.expiresAt !== null &&
        Date.parse(pass.startsAt) <= nowMs &&
        nowMs < Date.parse(pass.expiresAt)
      );
    }) ?? null
  );
}
