import type { Pool } from "pg";
import { UsageEventSchema, type UsageEvent } from "@/contracts/usage";

export async function recordUsageEvent(pool: Pick<Pool, "query">, input: UsageEvent): Promise<boolean> {
  const event = UsageEventSchema.parse(input);
  const result = await pool.query(
    `insert into private.usage_events(provider,event_id,phone_key,kind,occurred_at,is_team,is_test,is_automated)
    values($1,$2,$3,$4,$5,$6,$7,$8) on conflict do nothing`,
    [event.provider, event.eventId, event.phoneKey, event.kind, event.occurredAt, event.isTeam, event.isTest, event.isAutomated],
  );
  return result.rowCount === 1;
}
