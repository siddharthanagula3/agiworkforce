-- Reversal of 0226 : drop the durable image generation job model.
--
-- WHAT THIS COSTS: every queued, retryable and completed image job row is
-- deleted, together with the link rows that say which library assets a job
-- produced. The media assets themselves survive. Image generation falls back to
-- the synchronous request path, so an in-flight job loses its retry-without-
-- recharge handle; its managed_usage_requests reservation is untouched and
-- still settles or expires on its own schedule.

begin;

drop policy if exists image_generation_job_assets_tenant_isolation
  on public.image_generation_job_assets;
drop policy if exists image_generation_jobs_tenant_isolation on public.image_generation_jobs;
alter table if exists public.image_generation_job_assets disable row level security;
alter table if exists public.image_generation_jobs disable row level security;

drop index if exists public.idx_image_generation_job_assets_job;
drop index if exists public.idx_image_generation_jobs_conversation_created;
drop index if exists public.idx_image_generation_jobs_user_created;
drop index if exists public.idx_image_generation_jobs_due;

alter table if exists public.image_generation_jobs
  drop constraint if exists image_generation_jobs_claim_shape,
  drop constraint if exists image_generation_jobs_terminal_shape,
  drop constraint if exists image_generation_jobs_edit_shape,
  drop constraint if exists image_generation_jobs_managed_usage_fk;

drop table if exists public.image_generation_job_assets;
drop table if exists public.image_generation_jobs;

delete from public.schema_migrations
 where filename = '0226_durable_image_generation_jobs.sql';

commit;
