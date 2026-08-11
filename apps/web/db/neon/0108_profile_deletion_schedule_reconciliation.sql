-- 0108 — reconcile the account-deletion schedule after a legacy baseline.
--
-- The canonical runner can adopt a pre-ledger database only after proving the
-- tables expected at the selected baseline exist. Some legacy AGI databases
-- already had the final table set through migration 0072 while still missing
-- the two profile columns added by 0071. Baselining that state is therefore
-- table-complete but not column-complete, and durable video admission correctly
-- fails closed because its erasure fence depends on the deletion schedule.
--
-- Repeating the exact 0071 objects with IF NOT EXISTS is a no-op on databases
-- that applied 0071 normally and repairs only the legacy adopted shape. Keeping
-- this as a numbered migration makes the reconciliation reproducible instead
-- of relying on an untracked production SQL edit.

alter table public.profiles
  add column if not exists deletion_requested_at timestamptz;

alter table public.profiles
  add column if not exists deletion_scheduled_for timestamptz;

create index if not exists idx_profiles_deletion_scheduled_for
  on public.profiles (deletion_scheduled_for)
  where deletion_scheduled_for is not null;

comment on column public.profiles.deletion_requested_at is
  'When the account owner requested deletion. Informational; the schedule is deletion_scheduled_for.';
comment on column public.profiles.deletion_scheduled_for is
  'When the grace window closes. /api/cron/purge-deleted-accounts erases the account once this has passed.';
