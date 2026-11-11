-- =============================================================================
-- Migration 0417: remember which trial's reminder email has been settled
--
-- NOT YET APPLIED : draft only, pending explicit approval before running.
--
-- Why    : the hourly trial reminder picked a trial only while no in-app
--          notice existed for it. The in-app notice is written before the email
--          is sent, so an email that failed for a moment (provider outage,
--          rate limit) was never tried again: the notice made the trial look
--          done. The referral terms promise an email two days before the card
--          is charged, so a customer relying on it could miss the warning.
--
-- Shape  : subscriptions gains trial_reminder_settled_for, the Stripe
--          subscription id whose reminder email reached an end state: sent, or
--          refused for good (no address, no sender, a permanent rejection). It
--          holds the subscription id rather than a time so a later trial on the
--          same account, which carries a new subscription id, is reminded
--          again. The reminder selects trials where it differs from the current
--          subscription id and retries the email each hour until the trial
--          ends; the in-app notice keeps its own dedupe key, so a retry never
--          adds a second one. Null means no reminder email has settled yet.
--
--          Trials that already have an in-app reminder are marked settled here.
--          Whether their email went out was never recorded, and sending them a
--          second one is worse than the gap that was already open.
--
-- Access : no policy or grant changes; subscriptions keeps its row level
--          security, and the cron reads and writes it on the owner connection.
--
-- Empty  : a new nullable column; only trialing rows are backfilled.
--
-- Depends: 0003 (subscriptions), 0199 (notifications.dedupe_key)
-- =============================================================================

begin;

alter table public.subscriptions
  add column if not exists trial_reminder_settled_for text;

update public.subscriptions as subscription_row
   set trial_reminder_settled_for = subscription_row.stripe_subscription_id
 where subscription_row.status = 'trialing'
   and subscription_row.stripe_subscription_id is not null
   and subscription_row.trial_reminder_settled_for is null
   and exists (
         select 1
           from public.notifications as notice
          where notice.user_id = subscription_row.user_id
            and notice.dedupe_key = 'trial-ending:' || subscription_row.stripe_subscription_id
       );

comment on column public.subscriptions.trial_reminder_settled_for is
  'Stripe subscription id whose trial reminder email was sent or can never be sent. Null, or a different id, means the reminder email is still owed.';

commit;
