-- Preserve existing route consent; new passes require a separate RUTA activation.
alter table public.subscriptions add column route_active boolean not null default false;
update public.subscriptions set route_active=true where opted_out_at is null;

-- Old proposals bundled route consent and purchase. Ask for fresh, separate consent.
delete from private.subscription_intake;
delete from private.route_intake;
