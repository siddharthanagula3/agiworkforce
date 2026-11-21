-- Reversal of 0425: stop holding the age eligibility decision.
--
-- WHAT THIS COSTS: every decision is lost. These five columns are the only
-- record that an account holder was asked whether they are old enough and what
-- the answer was. Dropping them cannot be undone by applying 0425 again: every
-- account is asked once more at its next sign-in, and an account that was
-- refused for being under the minimum is no longer refused until it answers.
-- The server code that reads these columns refuses Cloud access when it cannot
-- read a decision, so deploy the build that no longer reads them before
-- running this.
--
-- No age, age range or birth date is lost, because none was ever stored.

begin;

alter table public.profiles
  drop constraint if exists profiles_adult_eligibility_shape;

alter table public.profiles
  drop column if exists adult_eligibility_decided_at,
  drop column if exists adult_eligibility_surface,
  drop column if exists adult_eligibility_method,
  drop column if exists adult_eligibility_minimum_age,
  drop column if exists adult_eligibility_outcome;

delete from public.schema_migrations
 where filename = '0425_adult_eligibility.sql';

commit;
