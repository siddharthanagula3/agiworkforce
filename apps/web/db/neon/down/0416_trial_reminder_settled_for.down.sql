-- Reversal of 0416: forget which trials have a settled reminder email.
--
-- WHAT THIS COSTS: the trial reminder reads this column, so the code that
-- selects trials by it must be rolled back first or every hourly run fails.
-- Once the old code runs again a trial is skipped as soon as it has an in-app
-- reminder, so a reminder email that failed is not retried. Trials still in
-- their reminder window whose email was already sent are skipped because their
-- in-app notice exists; none is emailed twice.

begin;

alter table public.subscriptions
  drop column if exists trial_reminder_settled_for;

delete from public.schema_migrations
 where filename = '0416_trial_reminder_settled_for.sql';

commit;
