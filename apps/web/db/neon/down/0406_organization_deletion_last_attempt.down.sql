-- Reversal of 0406: forget when each scheduled workspace deletion was last tried.
--
-- WHAT THIS COSTS: the workspace purge cron reads and writes this column, so
-- the code that stamps and orders by it must be rolled back first or every
-- sweep fails. The queue goes back to oldest schedule first, so workspaces that
-- cannot be erased can again hold the head of the queue and starve those
-- behind them.

begin;

alter table public.organizations
  drop column if exists deletion_last_attempt_at;

delete from public.schema_migrations
 where filename = '0406_organization_deletion_last_attempt.sql';

commit;
