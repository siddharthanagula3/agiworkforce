-- =============================================================================
-- Migration 0425: record that an account holder was found old enough, or not
--
-- NOT YET APPLIED : draft only, pending explicit approval before running.
--
-- Why    : on 2026-11-20 the minimum age moved from 13 to 18 on every consumer
--          surface. Until then the age question was answered in the browser or
--          on the phone and never reached the server, so a signed-in session
--          was all the server knew about a person: nothing recorded whether
--          anyone had been asked, and an account that passed the 13 and over
--          question looked the same as one that proved 18. Cloud access is now
--          refused until the server holds a decision made against the current
--          minimum, and the server needs somewhere to hold it.
--
-- What   : five nullable columns on public.profiles. They hold the outcome of
--          the decision, the minimum age it was made against, how it was
--          reached and where, and when. They never hold an age, an age range
--          or a birth date: the evidence is read once to reach the outcome and
--          is not written anywhere.
--
--          adult_eligibility_minimum_age is what lets a later, higher minimum
--          retire an earlier decision without touching the row: a decision
--          counts only while its minimum is at least the current one
--          (adultEligibilityIsCurrent in @agiworkforce/types).
--
-- Why columns on profiles and not a table: the same reason 0102 gave for the
-- terms acceptance. profiles is already keyed by the account id, already
-- classified by lib/server/account-erasure.ts and already isolated by row
-- security, so the decision inherits all three and is erased with the account.
--
-- Existing accounts: every column is NULL after this migration, which is the
-- truth about them. No row is backfilled from a terms acceptance or from an
-- account's age: neither shows that anyone was asked whether they are 18.
--
-- Reverse: down/0425_adult_eligibility.down.sql
-- =============================================================================

alter table public.profiles
  add column if not exists adult_eligibility_outcome text;

alter table public.profiles
  add column if not exists adult_eligibility_minimum_age smallint;

alter table public.profiles
  add column if not exists adult_eligibility_method text;

alter table public.profiles
  add column if not exists adult_eligibility_surface text;

alter table public.profiles
  add column if not exists adult_eligibility_decided_at timestamptz;

alter table public.profiles
  drop constraint if exists profiles_adult_eligibility_shape;

alter table public.profiles
  add constraint profiles_adult_eligibility_shape check (
    (adult_eligibility_outcome is null) = (adult_eligibility_minimum_age is null)
    and (adult_eligibility_outcome is null) = (adult_eligibility_method is null)
    and (adult_eligibility_outcome is null) = (adult_eligibility_surface is null)
    and (adult_eligibility_outcome is null) = (adult_eligibility_decided_at is null)
    and (adult_eligibility_outcome is null or adult_eligibility_outcome in ('eligible', 'ineligible'))
    and (
      adult_eligibility_method is null
      or adult_eligibility_method in ('declared_age', 'platform_age_signal')
    )
    and (adult_eligibility_minimum_age is null or adult_eligibility_minimum_age between 1 and 120)
  );

comment on column public.profiles.adult_eligibility_outcome is
  'eligible or ineligible: the decision on whether the account holder met the minimum age. NULL means nobody has been asked.';
comment on column public.profiles.adult_eligibility_minimum_age is
  'The minimum age the decision was made against. A decision counts only while this is at least the current minimum.';
comment on column public.profiles.adult_eligibility_method is
  'How the decision was reached: declared_age or platform_age_signal. The age or range itself is never stored.';
comment on column public.profiles.adult_eligibility_surface is
  'Where the evidence was collected (e.g. web-signup, web-login, mobile-auth).';
comment on column public.profiles.adult_eligibility_decided_at is
  'When the decision was made.';
