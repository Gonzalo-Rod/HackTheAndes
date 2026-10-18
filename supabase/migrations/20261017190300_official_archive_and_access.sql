create table private.official_alerts (
  source text not null check (source = 'sutran'),
  external_id uuid not null,
  source_updated_at timestamptz,
  state jsonb not null check (jsonb_typeof(state) = 'object'),
  primary key (source, external_id),
  check ((state->'alert'->>'source' = source and state->'alert'->>'externalId' = external_id::text) is true)
);

create table private.official_alert_versions (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  external_id uuid not null,
  source_updated_at timestamptz,
  retrieved_at timestamptz not null,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  unique nulls not distinct (source, external_id, source_updated_at),
  foreign key (source, external_id) references private.official_alerts(source, external_id)
    deferrable initially deferred
);

create table private.official_alert_history (
  event_key text primary key check (event_key ~ '^[a-f0-9]{64}$'),
  source text not null,
  external_id uuid not null,
  occurred_at timestamptz not null,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  foreign key (source, external_id) references private.official_alerts(source, external_id)
    deferrable initially deferred
);
create index official_alert_history_alert_time_idx on private.official_alert_history(source, external_id, occurred_at);

create table public.incident_official_alerts (
  incident_id uuid not null references public.incidents(id),
  source text not null,
  external_id uuid not null,
  primary key (incident_id, source, external_id),
  foreign key (source, external_id) references private.official_alerts(source, external_id)
);
create index incident_official_alerts_source_idx on public.incident_official_alerts(source, external_id);

create table private.ingestion_runs (
  id uuid primary key default gen_random_uuid(),
  request_id text not null unique,
  provider text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null check (status in ('running', 'complete', 'partial', 'failure')),
  summary jsonb check (jsonb_typeof(summary) = 'object')
);

-- The login password is provisioned separately, never inside a migration or Git.
do $$
begin
  if not exists (select from pg_catalog.pg_roles where rolname = 'peruroad_backend') then
    create role peruroad_backend nologin noinherit;
  end if;
end;
$$;
grant usage on schema public, private, extensions to peruroad_backend, service_role;

-- Public APIs, payment checks, and organization authorization will run server-side.
-- No anonymous/authenticated access to operational or private data is enabled here.
do $$
declare
  relation record;
begin
  for relation in
    select n.nspname, c.relname
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where c.relkind in ('r', 'p') and n.nspname in ('public', 'private')
      and c.relname <> 'spatial_ref_sys'
  loop
    execute format('alter table %I.%I enable row level security', relation.nspname, relation.relname);
    execute format('revoke all on %I.%I from anon, authenticated, public', relation.nspname, relation.relname);
    execute format('grant select, insert, update, delete on %I.%I to peruroad_backend, service_role', relation.nspname, relation.relname);
    execute format('create policy backend_access on %I.%I for all to peruroad_backend using (true) with check (true)', relation.nspname, relation.relname);
  end loop;
end;
$$;

-- Every later migration must explicitly decide its table grants and RLS policies.
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated;
