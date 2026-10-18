-- Climate exposure covers any prepared national road, each with its own geometry revision.
-- Reports, incidents and the gazetteer keep the PE-22 pilot constraint.
alter table public.geometry_revisions drop constraint geometry_revisions_road_code_check;
alter table public.geometry_revisions
  add constraint geometry_revisions_road_code_check check (road_code ~ '^PE-[0-9]{1,3}[A-ZÑ]{0,3}$');

alter table public.segments drop constraint segments_road_code_check;
alter table public.segments
  add constraint segments_road_code_check check (road_code ~ '^PE-[0-9]{1,3}[A-ZÑ]{0,3}$');

create index geometry_revisions_road_idx on public.geometry_revisions (road_code, retrieved_at desc);
