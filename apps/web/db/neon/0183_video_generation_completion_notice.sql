-- 0183 : record when a finished video job has been told to its owner.
--
-- NOT YET APPLIED : draft only, pending explicit approval before running.
--
-- A durable video job is reconciled by its own Workflow, so it reaches a
-- terminal state whether or not the tab that started it is still open. The
-- transcript row is updated either way, but nothing reached the user: the only
-- delivery was the status poll the closed tab had stopped making, so a job that
-- finished after the user walked away was finished in silence.
--
-- The notice is delivered through the push transports that already exist, and
-- this column is what makes it exactly once. It is claimed by a conditional
-- update rather than read-then-written, so two reconcilers racing on the same
-- terminal job produce one claim and one notice.

alter table public.video_generation_jobs
  add column if not exists completion_notified_at timestamptz;

comment on column public.video_generation_jobs.completion_notified_at is
  'When the owner was told this job reached a terminal state. Claimed by a conditional update, so it is set once no matter how many reconcilers observe the transition.';
