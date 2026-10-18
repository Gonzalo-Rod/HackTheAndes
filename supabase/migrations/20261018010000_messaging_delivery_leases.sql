-- A lease survives serverless restarts without holding a database transaction
-- open while calling the LLM or messaging provider. Completed keys remain durable.
create table private.messaging_deliveries (
  provider text not null check (length(provider) between 1 and 64),
  message_key text not null check (message_key ~ '^[a-f0-9]{64}$'),
  lease_id uuid not null,
  lease_until timestamptz not null,
  completed_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  primary key(provider, message_key)
);
alter table private.messaging_deliveries enable row level security;
revoke all on private.messaging_deliveries from public, anon, authenticated;
grant select, insert, update, delete on private.messaging_deliveries to peruroad_backend;
create policy messaging_deliveries_backend on private.messaging_deliveries
  to peruroad_backend using(true) with check(true);
