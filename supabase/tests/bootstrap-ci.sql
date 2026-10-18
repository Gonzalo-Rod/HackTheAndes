-- Disposable CI database only. This file is never run against the shared Supabase project.
do $$ begin
  if current_database() <> 'peruroad_test' then
    raise exception 'CI bootstrap requires the disposable peruroad_test database';
  end if;
end; $$;
drop extension if exists postgis cascade;
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
