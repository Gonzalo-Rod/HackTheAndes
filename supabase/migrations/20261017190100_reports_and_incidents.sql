-- Delivery destinations and raw report content stay encrypted and server-only.
create table private.delivery_contacts (
  id uuid primary key default gen_random_uuid(),
  phone_key text not null unique check (phone_key ~ '^[a-f0-9]{64}$'),
  ciphertext bytea not null,
  iv bytea not null check (octet_length(iv) = 12),
  auth_tag bytea not null check (octet_length(auth_tag) = 16),
  key_version text not null,
  created_at timestamptz not null default now(),
  disabled_at timestamptz
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_key text not null check (reporter_key ~ '^[a-f0-9]{64}$'),
  provider text not null,
  provider_message_id text not null,
  channel text not null check (channel in ('whatsapp', 'call')),
  raw_content_ciphertext bytea not null,
  raw_content_iv bytea not null check (octet_length(raw_content_iv) = 12),
  raw_content_auth_tag bytea not null check (octet_length(raw_content_auth_tag) = 16),
  key_version text not null,
  location extensions.geometry(Point, 4326),
  extracted jsonb not null default '{}' check (jsonb_typeof(extracted) = 'object'),
  observed_at timestamptz,
  created_at timestamptz not null default now(),
  is_team boolean not null default false,
  is_test boolean not null default false,
  unique (provider, provider_message_id)
);
create index reports_location_idx on public.reports using gist (location);
create index reports_reporter_created_idx on public.reports(reporter_key, created_at);

create table public.incidents (
  id uuid primary key default gen_random_uuid(),
  segment_id text references public.segments(id),
  road_code text not null check (road_code = 'PE-22'),
  type text not null check (type in ('huaico', 'derrumbe', 'inundación', 'bloqueo', 'accidente', 'obra', 'otro')),
  origin text not null check (origin in ('official', 'community', 'mixed')),
  source_entity text,
  road_status text not null check (road_status in ('interrumpido', 'restringido', 'normal', 'unknown')),
  status text not null check (status in ('active', 'clearing', 'cleared')),
  confidence numeric not null check (confidence between 0 and 1),
  location extensions.geometry(Point, 4326),
  first_seen timestamptz not null,
  last_confirmed timestamptz,
  check (last_confirmed is null or last_confirmed >= first_seen)
);
create index incidents_segment_idx on public.incidents(segment_id);
create index incidents_location_idx on public.incidents using gist (location);
create index incidents_active_road_idx on public.incidents(road_code, status, first_seen);

create table public.incident_reports (
  incident_id uuid not null references public.incidents(id),
  report_id uuid not null references public.reports(id),
  primary key (incident_id, report_id)
);
create index incident_reports_report_idx on public.incident_reports(report_id);

create table public.incident_status_log (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.incidents(id),
  observed_at timestamptz not null,
  road_status text not null check (road_status in ('interrumpido', 'restringido', 'normal', 'unknown')),
  status text not null check (status in ('active', 'clearing', 'cleared')),
  source text not null,
  source_event_key text not null,
  unique (incident_id, source, source_event_key)
);
create index incident_status_log_time_idx on public.incident_status_log(incident_id, observed_at);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  access_code_hash text,
  report_channel text check (report_channel in ('whatsapp', 'email')),
  report_stretches jsonb not null default '[]' check (jsonb_typeof(report_stretches) = 'array'),
  cost_per_hour_pen numeric check (cost_per_hour_pen >= 0),
  is_team boolean not null default false,
  is_test boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  contact_ref uuid not null references private.delivery_contacts(id),
  phone_key text not null check (phone_key ~ '^[a-f0-9]{64}$'),
  road_code text not null check (road_code = 'PE-22'),
  km_start numeric not null check (km_start >= 0),
  km_end numeric not null,
  distance_reference text not null check (distance_reference in ('official_km', 'geometry_distance')),
  channel text not null check (channel in ('whatsapp', 'sms')),
  consent_at timestamptz not null,
  opted_out_at timestamptz,
  is_team boolean not null default false,
  is_test boolean not null default false,
  check (km_end > km_start)
);
create index subscriptions_contact_idx on public.subscriptions(contact_ref);
create index subscriptions_phone_idx on public.subscriptions(phone_key);
