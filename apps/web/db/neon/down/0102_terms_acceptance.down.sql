-- Reverses 0102_terms_acceptance.sql.
--
-- DESTROYS EVIDENCE. These three columns are the only record that an account
-- holder was shown the clickwrap and ticked it; the arbitration clause, the
-- class-action waiver and the liability cap in /terms bind a user only where
-- that record exists. Dropping them cannot be undone by re-applying 0102 —
-- re-acceptance is the only way back, and it needs every user to sign in.
--
-- Export before running if any acceptance has been collected:
--   \copy (select user_id, terms_version, terms_accepted_at,
--                terms_accepted_surface
--            from public.profiles where terms_accepted_at is not null)
--     to 'terms-acceptances.csv' csv header

begin;

alter table public.profiles
  drop column if exists terms_accepted_surface,
  drop column if exists terms_accepted_at,
  drop column if exists terms_version;

delete from public.schema_migrations where filename = '0102_terms_acceptance.sql';

commit;
