create table public.passes (
  id uuid primary key default gen_random_uuid(),
  phone_key text check (phone_key ~ '^[a-f0-9]{64}$'),
  organization_id uuid references public.organizations(id),
  plan text not null check (plan in ('route_pass', 'company_dashboard', 'company_predictions')),
  days integer not null check (days > 0),
  route jsonb not null check (jsonb_typeof(route) = 'object'),
  starts_at timestamptz,
  expires_at timestamptz,
  payment_method text not null check (payment_method in ('qatom', 'yape', 'plin', 'bank_transfer', 'demo')),
  payment_ref text not null,
  amount_minor bigint not null check (amount_minor >= 0),
  currency text not null default 'PEN' check (currency = 'PEN'),
  status text not null check (status in ('pending', 'active', 'expired', 'cancelled')),
  is_test boolean not null default false,
  created_at timestamptz not null default now(),
  check ((plan = 'route_pass' and phone_key is not null and organization_id is null)
    or (plan <> 'route_pass' and organization_id is not null and phone_key is null)),
  check ((starts_at is null) = (expires_at is null)),
  check (expires_at is null or expires_at > starts_at),
  check (status <> 'active' or starts_at is not null),
  unique (payment_method, payment_ref)
);
create index passes_organization_expiry_idx on public.passes(organization_id, expires_at);
create index passes_phone_expiry_idx on public.passes(phone_key, expires_at);

create table private.payment_events (
  provider text not null,
  event_id text not null,
  pass_id uuid references public.passes(id),
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  primary key (provider, event_id)
);
create index payment_events_pass_idx on private.payment_events(pass_id);

create table public.trips (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id),
  contact_ref uuid not null references private.delivery_contacts(id),
  phone_key text not null check (phone_key ~ '^[a-f0-9]{64}$'),
  origin_km numeric not null check (origin_km >= 0),
  destination_km numeric not null check (destination_km >= 0),
  distance_reference text not null check (distance_reference in ('official_km', 'geometry_distance')),
  depart_at timestamptz not null,
  avg_speed_kmh numeric not null check (avg_speed_kmh > 0),
  status text not null check (status in ('planned', 'active', 'completed', 'cancelled')),
  call_consent_at timestamptz,
  created_at timestamptz not null default now(),
  check (origin_km <> destination_km)
);
create index trips_organization_idx on public.trips(organization_id);
create index trips_contact_idx on public.trips(contact_ref);
create index trips_status_departure_idx on public.trips(status, depart_at);

create table public.calls (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id),
  incident_id uuid references public.incidents(id),
  provider text not null,
  provider_call_id text not null,
  purpose text not null check (purpose in ('alert', 'confirmation')),
  status text not null,
  duration_seconds integer check (duration_seconds >= 0),
  transcript_ciphertext bytea,
  transcript_iv bytea,
  transcript_auth_tag bytea,
  key_version text,
  outcome jsonb check (jsonb_typeof(outcome) = 'object'),
  created_at timestamptz not null default now(),
  check ((transcript_ciphertext is null and transcript_iv is null and transcript_auth_tag is null and key_version is null)
    or (transcript_ciphertext is not null and transcript_iv is not null and octet_length(transcript_iv) = 12
      and transcript_auth_tag is not null and octet_length(transcript_auth_tag) = 16 and key_version is not null)),
  unique (provider, provider_call_id)
);
create index calls_trip_idx on public.calls(trip_id);
create index calls_incident_idx on public.calls(incident_id);

create table public.dispatch_decisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id),
  phone_key text check (phone_key ~ '^[a-f0-9]{64}$'),
  origin jsonb not null check (jsonb_typeof(origin) = 'object'),
  destination jsonb not null check (jsonb_typeof(destination) = 'object'),
  depart_at timestamptz not null,
  vehicle_type text not null check (vehicle_type in ('truck', 'bus', 'car')),
  recommendation text not null check (recommendation in ('salir', 'esperar', 'no_salir')),
  reasons jsonb not null check (jsonb_typeof(reasons) = 'array'),
  segment_levels jsonb not null check (jsonb_typeof(segment_levels) = 'array'),
  best_window_start timestamptz,
  best_window_end timestamptz,
  cost_at_stake_pen numeric check (cost_at_stake_pen >= 0),
  model_inputs jsonb not null check (jsonb_typeof(model_inputs) = 'object'),
  outcome text check (outcome in ('passed', 'delayed', 'stopped')),
  is_team boolean not null default false,
  is_test boolean not null default false,
  created_at timestamptz not null default now(),
  check (num_nonnulls(organization_id, phone_key) = 1),
  check ((best_window_start is null) = (best_window_end is null)),
  check (best_window_end is null or best_window_end > best_window_start)
);
create index dispatch_decisions_organization_idx on public.dispatch_decisions(organization_id, created_at);

create table public.waitlist (
  id uuid primary key default gen_random_uuid(),
  company text not null,
  contact_name text not null,
  role text not null,
  fleet_size integer check (fleet_size >= 0),
  routes jsonb not null check (jsonb_typeof(routes) = 'array'),
  contact_ref uuid not null references private.delivery_contacts(id),
  consent_at timestamptz not null,
  is_team boolean not null default false,
  is_test boolean not null default false,
  created_at timestamptz not null default now()
);
create index waitlist_contact_idx on public.waitlist(contact_ref);

create table public.weekly_reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  period_start date not null,
  period_end date not null,
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  page_url text,
  sent_at timestamptz,
  channel text not null check (channel in ('whatsapp', 'email')),
  delivery_status text not null,
  created_at timestamptz not null default now(),
  check (period_end > period_start),
  unique (organization_id, period_start, period_end)
);

create table private.api_calls (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id),
  endpoint text not null,
  params jsonb not null check (jsonb_typeof(params) = 'object'),
  qatom_tx_ref text unique,
  created_at timestamptz not null default now()
);
create index api_calls_organization_idx on private.api_calls(organization_id, created_at);
