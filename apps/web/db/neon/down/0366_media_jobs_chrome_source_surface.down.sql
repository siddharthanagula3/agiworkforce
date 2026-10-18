begin;

alter table public.video_generation_jobs
  drop constraint if exists video_generation_jobs_source_surface_check;

alter table public.video_generation_jobs
  add constraint video_generation_jobs_source_surface_check
    check (source_surface = any (array['web', 'mobile', 'desktop']))
    not valid;

alter table public.image_generation_jobs
  drop constraint if exists image_generation_jobs_source_surface_check;

alter table public.image_generation_jobs
  add constraint image_generation_jobs_source_surface_check
    check (source_surface = any (array['web', 'mobile', 'desktop', 'cli']))
    not valid;

delete from public.schema_migrations
 where filename = '0366_media_jobs_chrome_source_surface.sql';

commit;
