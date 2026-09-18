-- 0225 : the account lifecycle the identity bridge resolves into.
--
-- NOT YET APPLIED : draft only, pending explicit approval before running.
--
-- 0174 gave every (provider, subject) pair its own row and named this product's
-- own account id, but nothing recorded where a mapping came from or when it was
-- last used, so an identity that appeared in the table could not be told apart
-- from one seeded by 0174's backfill. creation_source and last_authenticated_at
-- are those two facts, written by the resolver at the authentication boundary.
--
-- account_status was added by 0020 as a bare `text default 'active'` and the
-- application has only ever written 'active', 'suspended' and 'banned'. Three
-- states the product already has no way to express:
--
--   locked              a credential problem the account holder recovers from
--                       themselves. Suspension is a decision someone made about
--                       the account and only support reverses it; treating the
--                       two as one status sends a locked-out user to support
--                       for a password reset, and tells a suspended user to try
--                       resetting their password.
--   deletion_scheduled  0071 records the deadline in deletion_scheduled_for,
--                       which is a date, not a state. Authentication must keep
--                       working in this state: cancelling the deletion is done
--                       while signed in.
--   deleted             the account is gone. Erasure hard-deletes the profile
--                       row, so this value is for the window between the
--                       erasure being ordered and the row being removed, and
--                       the durable record of an erased subject stays
--                       erasure_tombstones (0103), which outlives the profile
--                       and is what the resolver checks.
--
-- The constraint is NOT VALID on purpose. It binds every insert and update from
-- here on, which is what the vocabulary is for, without a full table scan that
-- could fail the apply on a value some older path wrote. Validate it separately
-- once `select distinct account_status from public.profiles` is known to hold
-- nothing else.

begin;

alter table public.identities
  add column if not exists creation_source text not null default 'backfill';

alter table public.identities
  drop constraint if exists identities_creation_source_known;

alter table public.identities
  add constraint identities_creation_source_known
  check (creation_source in ('backfill', 'sign_in', 'sso', 'link'));

alter table public.identities
  add column if not exists last_authenticated_at timestamptz;

comment on column public.identities.creation_source is
  'How this mapping came to exist: backfill (0174 seed), sign_in (the resolver linked an account that predates the row), sso, or link (a second provider added to an existing account).';
comment on column public.identities.last_authenticated_at is
  'Last time this identity authenticated a request. Null for a row no request has used since it was written.';

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

commit;

-- =============================================================================
-- VERIFICATION — run MANUALLY on a throwaway Neon BRANCH before production.
-- =============================================================================
-- -- 1. The seeded mappings report where they came from:
-- --    SELECT creation_source, count(*) FROM public.identities GROUP BY 1;
-- --    EXPECT: backfill | <the number of profiles 0174 seeded>
--
-- -- 2. An unknown creation source is refused:
-- --    UPDATE public.identities SET creation_source = 'nonsense'
-- --     WHERE subject = '<an existing identities.subject>';
-- --    EXPECT: ERROR new row violates check constraint
--
-- -- 3. A new account status is accepted and an unknown one is not:
-- --    UPDATE public.profiles SET account_status = 'locked' WHERE id = '<a profiles.id>';
-- --    EXPECT: UPDATE 1
-- --    UPDATE public.profiles SET account_status = 'nonsense' WHERE id = '<the same id>';
-- --    EXPECT: ERROR new row violates check constraint
--
-- -- 4. Clean up:
-- --    UPDATE public.profiles SET account_status = 'active' WHERE id = '<the same id>';
-- =============================================================================
