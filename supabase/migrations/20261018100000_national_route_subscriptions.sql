-- WhatsApp routes can follow any registered national road (RUTA PE-32). A phone keeps a single
-- active route: choosing another road replaces it, as changing the PE-22 stretch already did.
alter table public.subscriptions drop constraint subscriptions_road_code_check;
alter table public.subscriptions
  add constraint subscriptions_road_code_check check (road_code ~ '^PE-[0-9]{1,3}[A-ZÑ]{0,3}$');

-- New code upserts on phone_key alone. The older (phone_key, road_code) index stays so a deployment
-- still running the previous release keeps its ON CONFLICT target; with one road per phone it is redundant.
create unique index subscriptions_active_phone_key on public.subscriptions (phone_key) where opted_out_at is null;
create index subscriptions_active_revision_idx on public.subscriptions (geometry_revision)
  where opted_out_at is null and route_active;
