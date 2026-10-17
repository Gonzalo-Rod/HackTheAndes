-- Durable quotas survive serverless restarts; raw network addresses never enter storage.
create table private.request_buckets (
  bucket_key text primary key check (bucket_key ~ '^[a-f0-9]{64}$'),
  window_start timestamptz not null,
  attempts integer not null check (attempts > 0)
);
create index request_buckets_expiry_idx on private.request_buckets(window_start);
create table private.webhook_claims (
  provider text not null,
  event_id text not null,
  claimed_at timestamptz not null default now(),
  primary key(provider, event_id)
);
alter table public.trips add column is_team boolean not null default false;
alter table public.trips add column is_test boolean not null default false;
alter table public.incidents add column is_team boolean not null default false;
alter table public.incidents add column is_test boolean not null default false;

-- Realtime only exposes a change signal. Report content, identities and operational
-- incident rows retain their existing deny-by-default browser access rules.
create table public.incident_updates (
  id integer primary key check (id = 1),
  revision bigint not null default 0,
  changed_at timestamptz not null default now()
);
insert into public.incident_updates(id) values(1);
alter table public.incident_updates enable row level security;
create policy incident_updates_public_read on public.incident_updates for select to anon, authenticated using(true);
grant select on public.incident_updates to anon, authenticated;
grant select, update on public.incident_updates to peruroad_backend;
create policy incident_updates_backend on public.incident_updates to peruroad_backend using(true) with check(true);

create function private.notify_incident_update() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.incident_updates set revision = revision + 1, changed_at = clock_timestamp() where id = 1;
  return null;
end;
$$;
revoke all on function private.notify_incident_update() from public;
create trigger incidents_changed after insert or update or delete on public.incidents
for each statement execute function private.notify_incident_update();
do $$ begin
  if exists(select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.incident_updates;
  end if;
end $$;

alter table private.request_buckets enable row level security;
alter table private.webhook_claims enable row level security;
revoke all on private.request_buckets, private.webhook_claims from public, anon, authenticated;
grant select, insert, update, delete on private.request_buckets, private.webhook_claims to peruroad_backend;
create policy request_buckets_backend on private.request_buckets to peruroad_backend using(true) with check(true);
create policy webhook_claims_backend on private.webhook_claims to peruroad_backend using(true) with check(true);

-- A retry with the same request identifier cannot create a second waitlist row.
alter table public.waitlist add column request_id uuid;
create unique index waitlist_request_id_idx on public.waitlist(request_id) where request_id is not null;
