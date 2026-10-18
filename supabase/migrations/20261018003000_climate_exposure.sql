-- Immutable batches retain the numerical inputs, policy, provenance and assessed unknown coverage.
create table public.climate_exposure_assessments (
  id text primary key check(id ~ '^[a-f0-9]{64}$'),
  geometry_revision text not null references public.geometry_revisions(id),
  policy_sha256 text not null check(policy_sha256 ~ '^[a-f0-9]{64}$'),
  weather_captured_at timestamptz not null,
  assessed_at timestamptz not null check(assessed_at >= weather_captured_at),
  content_sha256 text not null check(content_sha256 ~ '^[a-f0-9]{64}$'),
  payload jsonb not null check(jsonb_typeof(payload) = 'object'),
  check(payload #>> '{assessment,assessmentId}' is not null and payload #>> '{assessment,assessmentId}' = id),
  check(payload #>> '{assessment,geometryRevision}' is not null and payload #>> '{assessment,geometryRevision}' = geometry_revision),
  check(payload #>> '{assessment,policySha256}' is not null and payload #>> '{assessment,policySha256}' = policy_sha256),
  check(payload #>> '{assessment,sources,weatherCapturedAt}' is not null and (payload #>> '{assessment,sources,weatherCapturedAt}')::timestamptz = weather_captured_at),
  check(payload #>> '{assessment,assessedAt}' is not null and (payload #>> '{assessment,assessedAt}')::timestamptz = assessed_at),
  check(octet_length(payload::text) <= 8388608)
);
create index climate_exposure_latest_idx on public.climate_exposure_assessments
  (geometry_revision,policy_sha256,weather_captured_at desc,assessed_at desc);
alter table public.climate_exposure_assessments enable row level security;
revoke all on public.climate_exposure_assessments from public,anon,authenticated;
grant select,insert,delete on public.climate_exposure_assessments to peruroad_backend;
create policy climate_exposure_backend on public.climate_exposure_assessments
  to peruroad_backend using(true) with check(true);
