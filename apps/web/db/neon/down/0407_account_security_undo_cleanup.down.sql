-- Reversal of 0407: forget the unfinished emailed-undo cleanup records.
--
-- WHAT THIS COSTS: the emailed undo link reads and writes these columns, so the
-- code that records and resumes cleanup must be rolled back first or every
-- link fails. Any cleanup that was unfinished at the time is forgotten: the link
-- is already burned, so the steps it had not reached (session sign-out, password
-- reset, compromise containment) are not retried and are not recoverable from
-- this record.

begin;

drop index if exists public.idx_account_security_enrollments_undo_cleanup_token;

alter table public.account_security_enrollments
  drop constraint if exists account_security_undo_cleanup_shape;

alter table public.account_security_enrollments
  drop column if exists undo_cleanup,
  drop column if exists undo_cleanup_lease_until,
  drop column if exists undo_cleanup_expires_at,
  drop column if exists undo_cleanup_token_hash;

delete from public.schema_migrations
 where filename = '0407_account_security_undo_cleanup.sql';

commit;
