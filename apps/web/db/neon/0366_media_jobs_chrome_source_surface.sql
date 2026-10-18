-- The Chrome extension is a Managed Cloud surface and now creates images in a
-- chat turn and videos through /api/media/video/generate. Its media key names
-- the surface as `chrome` (packages/platform/utils managedMediaIdempotency.ts),
-- and both job tables record that surface, so each list gains `chrome`.
--
-- Widening a check only admits new values, so the replacement is validated in
-- the same statement without rejecting any existing row.
--
-- Depends: 0105 (video_generation_jobs), 0226 (image_generation_jobs)

begin;

alter table public.image_generation_jobs
  drop constraint if exists image_generation_jobs_source_surface_check;

alter table public.image_generation_jobs
  add constraint image_generation_jobs_source_surface_check
    check (source_surface = any (array['web', 'mobile', 'desktop', 'cli', 'chrome']));

alter table public.video_generation_jobs
  drop constraint if exists video_generation_jobs_source_surface_check;

alter table public.video_generation_jobs
  add constraint video_generation_jobs_source_surface_check
    check (source_surface = any (array['web', 'mobile', 'desktop', 'chrome']));

commit;
