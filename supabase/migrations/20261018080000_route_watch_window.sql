-- Continuous route watch: a monitor watches a whole stretch until watch_until, with no
-- estimated truck position. Null keeps the original single-trip behavior.
alter table public.trips add column watch_until timestamptz;
alter table public.trips add constraint trips_watch_window check (watch_until is null or watch_until > depart_at);
