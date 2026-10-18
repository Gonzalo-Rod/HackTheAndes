-- Terrain samples are separate from the immutable geometry and surveyed road chainage.
create table public.segment_elevations (
  segment_id text primary key references public.segments(id) on delete cascade,
  geometry_revision text not null references public.geometry_revisions(id),
  elevation_m double precision not null check (elevation_m between -500 and 9000),
  sample_position extensions.geometry(Point, 4326) not null,
  distance_from_origin_km double precision not null check (distance_from_origin_km >= 0),
  sampling_method text not null check (sampling_method = 'segment_midpoint'),
  source jsonb not null check (jsonb_typeof(source) = 'object'),
  source_urls jsonb not null check (jsonb_typeof(source_urls) = 'array'),
  retrieved_at timestamptz not null,
  check (extensions.st_isvalid(sample_position) and not extensions.st_isempty(sample_position))
);
create index segment_elevations_revision_idx on public.segment_elevations(geometry_revision);
alter table public.segment_elevations enable row level security;
revoke all on public.segment_elevations from public, anon, authenticated;
grant select, insert, update, delete on public.segment_elevations to peruroad_backend, service_role;
create policy backend_access on public.segment_elevations
  for all to peruroad_backend using (true) with check (true);
