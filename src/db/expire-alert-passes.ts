import type { Pool } from "pg";
import { transaction } from "./transaction";

export function expireAlertPasses(pool: Pool, now: number) {
  return transaction(pool, async (client) => {
    // Delivery checks expiry independently; this job only reconciles stored state.
    const expired = await client.query(
      "update public.subscriptions set opted_out_at=alert_expires_at where opted_out_at is null and alert_expires_at<=$1 returning id,phone_key",
      [new Date(now)],
    );
    const ids: string[] = expired.rows.map((row: { id: string }) => row.id);
    if (ids.length) {
      await client.query(
        "update private.alert_deliveries set status='expired',lease_id=null,lease_until=null where subscription_id=any($1::uuid[]) and status='pending'",
        [ids],
      );
      await client.query("delete from private.weekly_pdf_preferences where subscription_id=any($1::uuid[])", [ids]);
      await client.query(
        "update private.weekly_pdf_deliveries set status='cancelled',lease_id=null,lease_until=null where subscription_id=any($1::uuid[]) and status='pending'",
        [ids],
      );
      await client.query(
        "update private.delivery_contacts c set disabled_at=$1 where phone_key=any($2::text[]) and not exists(select 1 from public.subscriptions s where s.contact_ref=c.id and s.opted_out_at is null)",
        [new Date(now), expired.rows.map((row: { phone_key: string }) => row.phone_key)],
      );
    }
    await client.query(
      "update private.alert_pass_requests set status='expired',checkout_lease_id=null,checkout_lease_until=null where status='pending' and expires_at<=$1",
      [new Date(now)],
    );
    return expired.rowCount ?? 0;
  });
}
