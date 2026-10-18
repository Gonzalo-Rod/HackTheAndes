-- Separate consent for weekly driver PDFs; short-alert consent never enrolls a driver.
create table private.weekly_pdf_preferences (
 subscription_id uuid primary key references public.subscriptions(id) on delete cascade,
 subscription_consent_at timestamptz not null,
 consent_at timestamptz,
 pending_code text check(pending_code ~ '^[A-F0-9]{8}$'),
 pending_expires_at timestamptz,
 check((pending_code is null)=(pending_expires_at is null))
);
create table private.weekly_pdf_deliveries (
 id uuid primary key default gen_random_uuid(),
 subscription_id uuid not null references public.subscriptions(id) on delete cascade,
 consent_at timestamptz not null,
 period_key text not null,
 period jsonb not null check(jsonb_typeof(period)='object'),
 report jsonb check(jsonb_typeof(report)='object'),
 pdf bytea check(octet_length(pdf)<=1048576),
 created_at timestamptz not null,
 expires_at timestamptz not null,
 status text not null default 'pending' check(status in ('pending','sent','cancelled','expired')),
 notified_at timestamptz,
 sent_at timestamptz,
 provider_message_id text,
 lease_id uuid, lease_until timestamptz,
 attempts integer not null default 0,
 last_error text,
 unique(subscription_id,period_key,consent_at),
 check((lease_id is null)=(lease_until is null)),
 check((report is null)=(pdf is null)),
 check(expires_at>created_at)
);
create index weekly_pdf_pending_idx on private.weekly_pdf_deliveries(subscription_id,created_at desc) where status='pending';
do $$ declare t text; begin
 foreach t in array array['weekly_pdf_preferences','weekly_pdf_deliveries'] loop
 execute format('alter table private.%I enable row level security',t);
 execute format('revoke all on private.%I from public,anon,authenticated',t);
 execute format('grant select,insert,update,delete on private.%I to peruroad_backend',t);
 execute format('create policy backend_access on private.%I to peruroad_backend using(true) with check(true)',t);
 end loop;
end $$;
