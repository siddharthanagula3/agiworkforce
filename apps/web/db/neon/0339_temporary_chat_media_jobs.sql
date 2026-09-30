-- =============================================================================
-- Migration 0339: mark image and video jobs made in a temporary chat
--
-- Why    : a temporary chat is deleted within 30 days, but the image and video
--          jobs it started kept their prompts for good. Both job tables point
--          at the conversation with on delete set null, so once the chat was
--          purged nothing tied the job to it any more and the prompt came back
--          in media history.
--
-- Shape  : image_generation_jobs and video_generation_jobs gain
--          temporary_chat, set when the job is created from a temporary chat.
--          The temporary-chat purge deletes finished jobs marked this way with
--          their chat, and media history never lists them. Existing rows keep
--          false. Billing reservations and usage rows carry no prompt and stay.
-- =============================================================================

begin;

alter table public.image_generation_jobs
  add column if not exists temporary_chat boolean not null default false;

alter table public.video_generation_jobs
  add column if not exists temporary_chat boolean not null default false;

create index if not exists idx_image_generation_jobs_temporary_chat
  on public.image_generation_jobs (created_at)
  where temporary_chat;

create index if not exists idx_video_generation_jobs_temporary_chat
  on public.video_generation_jobs (created_at)
  where temporary_chat;

commit;
