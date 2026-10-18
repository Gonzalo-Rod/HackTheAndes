-- Validated source captures retain null issue times rather than inventing forecast issuance.
create table public.data_snapshots (
  dataset text not null,
  snapshot_key text not null,
  geometry_revision text not null references public.geometry_revisions(id),
  captured_at timestamptz not null,
  content_sha256 text not null check(content_sha256 ~ '^[a-f0-9]{64}$'),
  payload jsonb not null check(jsonb_typeof(payload)='object'),
  primary key(dataset,snapshot_key,geometry_revision)
);
create index data_snapshots_latest_idx on public.data_snapshots(dataset,geometry_revision,captured_at desc);
alter table public.data_snapshots enable row level security;
revoke all on public.data_snapshots from public,anon,authenticated;
grant select,insert,update,delete on public.data_snapshots to peruroad_backend;
create policy data_snapshots_backend on public.data_snapshots to peruroad_backend using(true) with check(true);
