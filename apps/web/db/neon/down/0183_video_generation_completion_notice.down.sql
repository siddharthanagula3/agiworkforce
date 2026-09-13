alter table public.video_generation_jobs
  drop column if exists completion_notified_at;
