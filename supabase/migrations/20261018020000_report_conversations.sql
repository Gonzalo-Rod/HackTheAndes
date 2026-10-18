-- Pending report data and replay responses are encrypted; only HMAC identities
-- and lease/retention timestamps are available without the application key.
create table private.report_conversations (
  phone_key text primary key check (phone_key ~ '^[a-f0-9]{64}$'),
  lease_id uuid,
  lease_until timestamptz,
  ciphertext bytea,
  iv bytea,
  auth_tag bytea,
  key_version text,
  expires_at timestamptz,
  check ((lease_id is null) = (lease_until is null)),
  check ((ciphertext is null and iv is null and auth_tag is null and key_version is null and expires_at is null)
    or (ciphertext is not null and iv is not null and auth_tag is not null and octet_length(iv)=12 and octet_length(auth_tag)=16 and key_version is not null and expires_at is not null))
);
create table private.report_message_results (
  event_key text primary key check (event_key ~ '^[a-f0-9]{64}$'),
  phone_key text not null check (phone_key ~ '^[a-f0-9]{64}$'),
  ciphertext bytea not null,
  iv bytea not null check (octet_length(iv)=12),
  auth_tag bytea not null check (octet_length(auth_tag)=16),
  key_version text not null,
  created_at timestamptz not null default clock_timestamp()
);
create index report_conversations_expiry_idx on private.report_conversations(expires_at);
create index report_message_results_retention_idx on private.report_message_results(created_at);
alter table private.report_conversations enable row level security;
alter table private.report_message_results enable row level security;
revoke all on private.report_conversations,private.report_message_results from public,anon,authenticated;
grant select,insert,update,delete on private.report_conversations,private.report_message_results to peruroad_backend;
create policy report_conversations_backend on private.report_conversations to peruroad_backend using(true) with check(true);
create policy report_message_results_backend on private.report_message_results to peruroad_backend using(true) with check(true);
