-- Seven elapsed days from the request; no recurring billing or implicit renewal.
alter table private.subscription_intake add column requested_at timestamptz not null default now();
alter table public.subscriptions add column alert_expires_at timestamptz;
alter table public.subscriptions add column alert_payment_id uuid;

create table private.alert_pass_requests (
 id uuid primary key default gen_random_uuid(),
 phone_key text not null check(phone_key ~ '^[a-f0-9]{64}$'),
 event_key text not null unique check(event_key ~ '^[a-f0-9]{64}$'),
 range jsonb not null check(jsonb_typeof(range)='object'),
 ciphertext bytea not null, iv bytea not null check(octet_length(iv)=12),
 auth_tag bytea not null check(octet_length(auth_tag)=16), key_version text not null,
 requested_at timestamptz not null, expires_at timestamptz not null,
 consent_at timestamptz not null, is_team boolean not null, is_test boolean not null,
 status text not null default 'pending' check(status in ('pending','paid','cancelled','expired')),
 checkout_url jsonb, checkout_lease_id uuid, checkout_lease_until timestamptz,
 transaction_id uuid unique, settled_at timestamptz,
 subscription_id uuid references public.subscriptions(id),
 check(expires_at=requested_at+interval '168 hours'),
 check((checkout_lease_id is null)=(checkout_lease_until is null)),
 check((status='paid')=(transaction_id is not null))
);
create unique index alert_pass_pending_key on private.alert_pass_requests(phone_key) where status='pending';
create index alert_pass_expiry_idx on private.alert_pass_requests(expires_at) where status='pending';
alter table public.subscriptions add constraint subscriptions_alert_payment_fk
 foreign key(alert_payment_id) references private.alert_pass_requests(id);
alter table private.alert_pass_requests enable row level security;
revoke all on private.alert_pass_requests from public,anon,authenticated;
grant select,insert,update,delete on private.alert_pass_requests to peruroad_backend;
create policy backend_access on private.alert_pass_requests to peruroad_backend using(true) with check(true);
