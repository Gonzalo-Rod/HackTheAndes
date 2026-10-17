import type { Pool } from "pg";
import { z } from "zod";
import { PassSchema } from "@/domain/access/entitlements";
import { WeeklyReportDataSchema } from "@/contracts/platform";

export function createAccessRepository(pool: Pool) {
  return {
    async findOrganization(codeHash: string) {
      const result = await pool.query("select id,access_code_hash as hash from public.organizations where access_code_hash=$1 limit 1", [
        codeHash,
      ]);
      return result.rows[0] ? z.object({ id: z.uuid(), hash: z.string().regex(/^[a-f0-9]{64}$/) }).parse(result.rows[0]) : null;
    },
    async passes(organizationId: string) {
      const result = await pool.query(
        `select organization_id as "organizationId",phone_key as "phoneKey",plan,status,
        to_char(starts_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "startsAt",
        to_char(expires_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "expiresAt"
        from public.passes where organization_id=$1 and status='active'`,
        [organizationId],
      );
      return z.array(PassSchema).parse(result.rows);
    },
    async reports(organizationId: string) {
      const result = await pool.query(
        `select id,period_start::text as "periodStart",period_end::text as "periodEnd",data from public.weekly_reports where organization_id=$1 order by period_end desc limit 52`,
        [organizationId],
      );
      return z
        .array(z.object({ id: z.uuid(), periodStart: z.iso.date(), periodEnd: z.iso.date(), data: WeeklyReportDataSchema }))
        .parse(result.rows);
    },
  };
}
export type AccessRepository = ReturnType<typeof createAccessRepository>;
