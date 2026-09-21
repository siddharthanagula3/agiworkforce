-- Restores 0225's account_status vocabulary, which has no value for an open
-- account recovery. Any profile already sitting in 'recovery_pending' keeps that
-- value: the constraint comes back NOT VALID, so existing rows are not rescanned,
-- and the application then reads an unrecognised status, which
-- effectiveAccountStatus reports as null rather than as active.
begin;

alter table public.profiles
  drop constraint if exists profiles_account_status_known;

alter table public.profiles
  add constraint profiles_account_status_known
  check (
    account_status is null
    or account_status in (
      'active', 'locked', 'suspended', 'banned', 'deletion_scheduled', 'deleted'
    )
  )
  not valid;

comment on column public.profiles.account_status is
  'active: normal. locked: self-service recovery (credential problem). suspended/banned: a decision about the account, reversed only by support. deletion_scheduled: signed in and able to cancel. deleted: erasure ordered; erasure_tombstones (0103) is the record that outlives the row.';

delete from public.schema_migrations where filename = '0277_account_recovery_state.sql';
commit;
