-- Keep source-reported kilometers distinct from independently calibrated road kilometers.
alter table public.gazetteer
  drop constraint gazetteer_road_code_name_source_url_key,
  add column provider text,
  add column source_id text,
  add column source_kind text check (source_kind in ('bridge', 'sos', 'toll')),
  add column geometry_revision text references public.geometry_revisions(id),
  add column reported_road_code text check (reported_road_code = 'PE-22'),
  add column reported_km double precision check (reported_km >= 0),
  add column distance_from_origin_km double precision check (distance_from_origin_km >= 0),
  add column distance_from_road_m double precision check (distance_from_road_m between 0 and 500),
  add column snapped_location extensions.geometry(Point, 4326),
  add constraint gazetteer_source_identity unique(provider, geometry_revision, source_id),
  add constraint gazetteer_imported_provenance check (provider is null or (
    provider = 'mtc-ign' and source_id is not null and source_kind is not null
    and geometry_revision is not null and segment_id is not null
    and distance_from_origin_km is not null and distance_from_road_m is not null
    and snapped_location is not null and official_km is null and not verified
  ));
create table public.gazetteer_snapshots (
  provider text not null check (provider = 'mtc-ign'),
  geometry_revision text not null references public.geometry_revisions(id),
  retrieved_at timestamptz not null,
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  primary key(provider, geometry_revision)
);
alter table public.gazetteer_snapshots enable row level security;
revoke all on public.gazetteer_snapshots from public, anon, authenticated;
grant select, insert, update, delete on public.gazetteer_snapshots to peruroad_backend, service_role;
create policy backend_access on public.gazetteer_snapshots
  for all to peruroad_backend using (true) with check (true);
