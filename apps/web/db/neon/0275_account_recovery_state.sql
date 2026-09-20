-- Depends: 0225
-- 0275 : recovery is a state of its own, not a flavour of locked.
--
-- NOT YET APPLIED : draft only, pending explicit approval before running.
--
-- 0225 gave account_status a vocabulary that separates a credential problem the
-- holder resolves themselves ('locked') from a decision someone made about the
-- account ('suspended'). It has no value for the window in between: an account
-- recovery that has been started and not finished.
--
-- That window is not 'locked'. A locked account is one password reset away and
-- the product tells the holder exactly that. An account halfway through recovery
-- has an unverified claim of ownership attached to it, and the one thing it must
-- not do is grant normal access while that claim is open. Folding it into
-- 'locked' would send the holder to the same self-service page while a second
-- party is mid-claim on the same account; folding it into 'suspended' would send
-- them to support for something support has no part in.
--
-- The constraint is replaced rather than altered because Postgres has no ALTER
-- CONSTRAINT for a check expression. It stays NOT VALID for the reason 0225
-- gives: it must bind every write from here on without a full table scan that an
-- older value could fail.

begin;

alter table public.profiles
  drop constraint if exists profiles_account_status_known;

alter table public.profiles
  add constraint profiles_account_status_known
  check (
    account_status is null
    or account_status in (
      'active',
      'locked',
      'recovery_pending',
      'suspended',
      'banned',
      'deletion_scheduled',
      'deleted'
    )
  )
  not valid;

comment on column public.profiles.account_status is
  'active: normal. locked: self-service recovery (credential problem). recovery_pending: an account recovery is open and unverified, so normal access is withheld until it resolves. suspended/banned: a decision about the account, reversed only by support. deletion_scheduled: signed in and able to cancel. deleted: erasure ordered; erasure_tombstones (0103) is the record that outlives the row.';

commit;

-- =============================================================================
-- VERIFICATION — run MANUALLY on a throwaway Neon BRANCH before production.
-- =============================================================================
-- -- 1. The new state is accepted:
-- --    UPDATE public.profiles SET account_status = 'recovery_pending' WHERE id = '<a profiles.id>';
-- --    EXPECT: UPDATE 1
--
-- -- 2. An unknown state is still refused:
-- --    UPDATE public.profiles SET account_status = 'nonsense' WHERE id = '<the same id>';
-- --    EXPECT: ERROR new row violates check constraint "profiles_account_status_known"
--
-- -- 3. Clean up:
-- --    UPDATE public.profiles SET account_status = 'active' WHERE id = '<the same id>';
-- =============================================================================
