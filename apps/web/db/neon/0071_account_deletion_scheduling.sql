-- 0071: make the account-deletion grace window real.
--
-- PER-24. `DELETE /api/user/delete-account` writes
-- `profiles.deletion_requested_at` / `profiles.deletion_scheduled_for` and
-- answers the user with "your account and all data will be permanently deleted
-- within 24 hours". Neither column existed in any migration, so that UPDATE
-- always raised undefined_column, the route silently fell through to its
-- "immediate delete" catch branch, and nothing anywhere consumed a schedule.
-- The window it promised was not shortened — it never existed.
--
-- These columns are the schedule that `GET /api/cron/purge-deleted-accounts`
-- now consumes: once `deletion_scheduled_for` has passed, that job erases every
-- user-scoped row AND the stored R2 objects (lib/server/account-erasure.ts)
-- before removing the identity-provider account.
--
-- Both columns are nullable: a NULL `deletion_scheduled_for` means "not
-- scheduled", which is the state of every existing row, so this migration
-- cannot schedule anyone for deletion by itself.

alter table public.profiles
  add column if not exists deletion_requested_at timestamptz;

alter table public.profiles
  add column if not exists deletion_scheduled_for timestamptz;

-- Partial index: the purge cron scans only rows that are actually scheduled,
-- which is a vanishing fraction of the table.
create index if not exists idx_profiles_deletion_scheduled_for
  on public.profiles (deletion_scheduled_for)
  where deletion_scheduled_for is not null;

comment on column public.profiles.deletion_requested_at is
  'When the account owner requested deletion. Informational; the schedule is deletion_scheduled_for.';
comment on column public.profiles.deletion_scheduled_for is
  'When the grace window closes. /api/cron/purge-deleted-accounts erases the account once this has passed.';
