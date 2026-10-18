-- Shared spatial foundation. Distances along geometry are not official kilometer markers.
create schema if not exists extensions;
create extension if not exists postgis with schema extensions;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.geometry_revisions (
  id text primary key check (id ~ '^[a-f0-9]{64}$'),
  road_code text not null check (road_code = 'PE-22'),
  retrieved_at timestamptz not null,
  source_urls jsonb not null check (jsonb_typeof(source_urls) = 'object'),
  source_snapshot jsonb not null check (jsonb_typeof(source_snapshot) = 'object'),
  measured_length_km double precision not null check (measured_length_km > 0),
  created_at timestamptz not null default now()
);

create table public.segments (
  id text primary key,
  geometry_revision text not null references public.geometry_revisions(id),
  road_code text not null check (road_code = 'PE-22'),
  distance_from_origin_start_km double precision not null check (distance_from_origin_start_km >= 0),
  distance_from_origin_end_km double precision not null,
  official_km_start double precision,
  official_km_end double precision,
  kilometer_calibration text not null check (kilometer_calibration in ('unverified', 'calibrated')),
  source_references jsonb not null check (jsonb_typeof(source_references) = 'array'),
  geometry extensions.geometry(LineString, 4326) not null,
  elevation_m double precision,
  susceptibility_class text,
  created_at timestamptz not null default now(),
  check (distance_from_origin_end_km > distance_from_origin_start_km),
  check ((kilometer_calibration = 'unverified' and official_km_start is null and official_km_end is null)
    or (kilometer_calibration = 'calibrated' and official_km_start >= 0 and official_km_end > official_km_start
      and official_km_start is not null and official_km_end is not null)),
  check (extensions.st_isvalid(geometry) and not extensions.st_isempty(geometry))
);
create index segments_geometry_idx on public.segments using gist (geometry);
create index segments_revision_idx on public.segments (geometry_revision);

create table public.catchments (
  id uuid primary key default gen_random_uuid(),
  name text,
  geometry extensions.geometry(MultiPolygon, 4326) not null,
  pour_point extensions.geometry(Point, 4326) not null,
  area_km2 double precision not null check (area_km2 > 0),
  mean_slope_degrees double precision check (mean_slope_degrees between 0 and 90),
  method text not null check (method in ('dem', 'hydrobasins')),
  sample_points jsonb not null default '[]' check (jsonb_typeof(sample_points) = 'array'),
  low_confidence boolean not null default true,
  provenance jsonb not null check (jsonb_typeof(provenance) = 'object'),
  created_at timestamptz not null default now(),
  check (extensions.st_isvalid(geometry) and not extensions.st_isempty(geometry))
);
create index catchments_geometry_idx on public.catchments using gist (geometry);

create table public.segment_catchments (
  segment_id text not null references public.segments(id) on delete cascade,
  catchment_id uuid not null references public.catchments(id) on delete cascade,
  primary key (segment_id, catchment_id)
);
create index segment_catchments_catchment_idx on public.segment_catchments(catchment_id);

create table public.gazetteer (
  id uuid primary key default gen_random_uuid(),
  road_code text not null check (road_code = 'PE-22'),
  name text not null,
  aliases text[] not null default '{}',
  location extensions.geometry(Point, 4326) not null,
  official_km double precision check (official_km >= 0),
  segment_id text references public.segments(id),
  source_url text not null,
  retrieved_at timestamptz not null,
  verified boolean not null default false,
  unique (road_code, name, source_url)
);
create index gazetteer_location_idx on public.gazetteer using gist (location);
create index gazetteer_segment_idx on public.gazetteer(segment_id);

create table public.hazard_layers (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  external_id text not null,
  hazard_type text not null,
  geometry extensions.geometry(Geometry, 4326) not null,
  source_url text not null,
  retrieved_at timestamptz not null,
  properties jsonb not null check (jsonb_typeof(properties) = 'object'),
  semantics_verified boolean not null default false,
  unique (provider, external_id)
);
create index hazard_layers_geometry_idx on public.hazard_layers using gist (geometry);

create table public.weather_inputs (
  id uuid primary key default gen_random_uuid(),
  catchment_id uuid references public.catchments(id),
  provider text not null,
  weather_model text not null,
  grid_resolution_km double precision not null check (grid_resolution_km > 0),
  kind text not null check (kind in ('forecast', 'archived_forecast', 'observation', 'reanalysis')),
  sample_point extensions.geometry(Point, 4326) not null,
  forecast_issued_at timestamptz,
  valid_from timestamptz not null,
  valid_until timestamptz not null,
  precipitation_mm numeric not null check (precipitation_mm >= 0),
  source_url text not null,
  retrieved_at timestamptz not null,
  inputs jsonb not null check (jsonb_typeof(inputs) = 'object'),
  check (valid_until > valid_from),
  check (kind not in ('forecast', 'archived_forecast') or forecast_issued_at is not null)
);
create index weather_inputs_catchment_time_idx on public.weather_inputs(catchment_id, valid_from);

create table public.official_warnings (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  external_id text not null,
  product text not null,
  raw_level text not null,
  geometry extensions.geometry(MultiPolygon, 4326),
  provider_date date,
  issued_at timestamptz,
  valid_from timestamptz,
  valid_until timestamptz,
  source_url text not null,
  retrieved_at timestamptz not null,
  semantics_verified boolean not null default false,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  unique (provider, product, external_id),
  check (valid_from is null or valid_until is null or valid_until > valid_from)
);
create index official_warnings_geometry_idx on public.official_warnings using gist (geometry);

create table public.risk_scores (
  id uuid primary key default gen_random_uuid(),
  catchment_id uuid not null references public.catchments(id),
  computed_at timestamptz not null default now(),
  forecast_issued_at timestamptz not null,
  weather_model text not null,
  grid_resolution_km double precision not null check (grid_resolution_km > 0),
  model_version text not null,
  horizon_hours integer not null check (horizon_hours in (6, 24, 72)),
  window_start timestamptz not null,
  window_end timestamptz not null,
  level text not null check (level in ('verde', 'amarillo', 'naranja', 'rojo')),
  score numeric not null,
  inputs jsonb not null check (jsonb_typeof(inputs) = 'object'),
  reasons jsonb not null check (jsonb_typeof(reasons) = 'array'),
  check (window_end > window_start),
  unique (catchment_id, forecast_issued_at, model_version, horizon_hours, window_start)
);
create index risk_scores_catchment_time_idx on public.risk_scores(catchment_id, window_start);
