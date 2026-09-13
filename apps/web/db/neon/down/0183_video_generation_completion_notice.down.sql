-- Reversal of 0183 : drop the marker that records a video job was announced.
--
-- WHAT THIS COSTS: the memory of which finished jobs their owners have already
-- been told about. Reapplying 0183 gives every job a null marker again, so any
-- terminal job a reconciler touches afterwards is announced a second time. The
-- job rows, their results and their billing are untouched; only the
-- announcement is repeatable.
--
-- ROLLBACK ORDER is free here. deliverVideoCompletionNotice catches the claim
-- failure and sends nothing, so application code that predates the drop
-- degrades to silence rather than to an error.

begin;

alter table public.video_generation_jobs
  drop column if exists completion_notified_at;

delete from public.schema_migrations
  where filename = '0183_video_generation_completion_notice.sql';

commit;
