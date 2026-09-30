-- Reversal of 0339 : image and video jobs lose the temporary-chat mark.
--
-- WHAT THIS COSTS: jobs from temporary chats can no longer be told apart, so
-- the purge leaves them and media history lists them again.

begin;

drop index if exists public.idx_video_generation_jobs_temporary_chat;
drop index if exists public.idx_image_generation_jobs_temporary_chat;

alter table public.video_generation_jobs drop column if exists temporary_chat;
alter table public.image_generation_jobs drop column if exists temporary_chat;

delete from public.schema_migrations
 where filename = '0339_temporary_chat_media_jobs.sql';

commit;
