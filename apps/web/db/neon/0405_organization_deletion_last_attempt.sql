-- =============================================================================
-- Migration 0405: remember when each scheduled workspace deletion was last tried
--
-- NOT YET APPLIED : draft only, pending explicit approval before running.
--
-- Why    : the workspace purge cron took the oldest due workspaces first on
--          every run. A workspace that cannot be erased (an active legal hold,
--          an erasure that keeps failing) keeps its schedule, so it stayed at
--          the head of the queue and, once enough of them piled up, workspaces
--          queued behind them were never reached.
--
-- Shape  : One nullable timestamp on organizations, stamped by the cron each
--          time it attempts a workspace. The cron orders by it, never-attempted
--          first, then by deletion_scheduled_for, so every due workspace gets a
--          turn. deletion_scheduled_for is not touched: moving it would reopen
--          the owner's cancellation window on a workspace already partly erased.
--          The existing partial index on deletion_scheduled_for still bounds the
--          scan to scheduled workspaces, so no index is added.
--
-- Empty  : existing workspaces keep null and sort first until they are tried.
--
-- Depends: 0162 (organization deletion schedule)
-- =============================================================================

begin;

alter table public.organizations
  add column if not exists deletion_last_attempt_at timestamptz;

comment on column public.organizations.deletion_last_attempt_at is
  'When /api/cron/purge-deleted-organizations last tried to erase this workspace. Orders the queue so a workspace that cannot be erased does not starve the ones behind it. Null means never tried.';

commit;
