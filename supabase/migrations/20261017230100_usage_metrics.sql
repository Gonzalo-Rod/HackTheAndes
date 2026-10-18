-- B records successful user answers, never incoming webhook deliveries or retries.
create table private.usage_events (
  provider text not null,
  event_id text not null,
  phone_key text not null check(phone_key ~ '^[a-f0-9]{64}$'),
  kind text not null check(kind in ('query_answered')),
  occurred_at timestamptz not null,
  is_team boolean not null default false,
  is_test boolean not null default false,
  is_automated boolean not null default false,
  primary key(provider,event_id,kind)
);
create index usage_events_phone_idx on private.usage_events(phone_key,occurred_at);
alter table private.usage_events enable row level security;
revoke all on private.usage_events from public, anon, authenticated;
grant select,insert,delete on private.usage_events to peruroad_backend;
create policy usage_events_backend on private.usage_events to peruroad_backend using(true) with check(true);
