-- Reversal of 0249.
--
-- Dropping the columns takes their check constraints and comments with them.
-- Rows that reached 'cancelled' through the cooperative path stay cancelled:
-- the status existed before this migration, only the record of who asked and
-- why is lost.

begin;

drop index if exists public.idx_background_jobs_cancel_requested;

alter table public.background_jobs
  drop column if exists worker_id,
  drop column if exists usage,
  drop column if exists retry_reason,
  drop column if exists cancel_requested_at,
  drop column if exists cancel_requested_by,
  drop column if exists cancel_reason;

delete from public.schema_migrations
 where filename = '0249_background_job_worker_fencing_and_cancellation.sql';

commit;
