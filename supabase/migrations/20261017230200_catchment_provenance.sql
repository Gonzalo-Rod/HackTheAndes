alter table public.catchments add column external_id text;
alter table public.catchments add column geometry_revision text references public.geometry_revisions(id);
alter table public.catchments add constraint catchments_source_revision_key unique(external_id,geometry_revision);
create table public.catchment_snapshots (
  geometry_revision text primary key references public.geometry_revisions(id),
  prepared_at timestamptz not null,
  snapshot jsonb not null check(jsonb_typeof(snapshot)='object')
);
alter table public.catchment_snapshots enable row level security;
revoke all on public.catchment_snapshots from public,anon,authenticated;
grant select,insert,update,delete on public.catchment_snapshots to peruroad_backend;
create policy catchment_snapshots_backend on public.catchment_snapshots to peruroad_backend using(true) with check(true);
