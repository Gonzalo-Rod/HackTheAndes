-- Server-only conversational consent, bounded audio caching and durable delivery outbox.
alter table public.subscriptions add column geometry_revision text references public.geometry_revisions(id);
alter table public.subscriptions add column range_label text;
alter table public.subscriptions add column last_inbound_at timestamptz;
alter table public.subscriptions add column last_alert_at timestamptz;
create unique index subscriptions_active_road_key on public.subscriptions(phone_key,road_code) where opted_out_at is null;
create table private.subscription_intake (
 phone_key text primary key check(phone_key ~ '^[a-f0-9]{64}$'), code text not null,
 range jsonb not null check(jsonb_typeof(range)='object'), is_test boolean not null, expires_at timestamptz not null
);
create table private.subscription_results (
 event_key text primary key check(event_key ~ '^[a-f0-9]{64}$'), ciphertext bytea not null, iv bytea not null check(octet_length(iv)=12),
 auth_tag bytea not null check(octet_length(auth_tag)=16),key_version text not null,created_at timestamptz not null default now()
);
create table private.audio_transcripts (like private.subscription_results including all);
create table private.subscription_checkpoints (
 subscription_id uuid primary key references public.subscriptions(id), state jsonb not null default '{}' check(jsonb_typeof(state)='object')
);
create table private.alert_deliveries (
 id uuid primary key default gen_random_uuid(),subscription_id uuid not null references public.subscriptions(id),
 consent_at timestamptz not null, selected jsonb not null check(jsonb_typeof(selected)='object'), body text not null check(length(body)<=4096), checkpoint jsonb not null check(jsonb_typeof(checkpoint)='object'),
 expires_at timestamptz not null, created_at timestamptz not null default now(),sent_at timestamptz,
 status text not null default 'pending' check(status in ('pending','sent','cancelled','expired')),
 lease_id uuid,lease_until timestamptz, attempts integer not null default 0,last_error text,
 check((lease_id is null)=(lease_until is null))
);
create unique index alert_delivery_pending_key on private.alert_deliveries(subscription_id) where status='pending';
create index alert_delivery_status_idx on private.alert_deliveries(status,created_at);
do $$ declare t text; begin
 foreach t in array array['subscription_intake','subscription_results','audio_transcripts','subscription_checkpoints','alert_deliveries'] loop
 execute format('alter table private.%I enable row level security',t);
 execute format('revoke all on private.%I from public,anon,authenticated',t);
 execute format('grant select,insert,update,delete on private.%I to peruroad_backend',t);
 execute format('create policy backend_access on private.%I to peruroad_backend using(true) with check(true)',t);
 end loop;
end $$;
