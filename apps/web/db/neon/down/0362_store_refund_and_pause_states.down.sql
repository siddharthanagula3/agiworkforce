-- Reversal of 0362 : a refunded request needs a Stripe refund id again, and a
-- subscription can no longer be recorded as paused.
--
-- WHAT THIS COSTS: a store charge can no longer be closed as refunded and a Play
-- pause notice fails again. This file fails while any request for a store
-- charge is recorded as refunded or any subscription is paused. Decide what
-- those rows should say before running it; nothing here rewrites them.

begin;

alter table public.billing_refund_requests
  drop constraint if exists billing_refund_requests_refund_is_recorded;

alter table public.billing_refund_requests
  add constraint billing_refund_requests_refund_is_recorded
  check (status <> 'refunded' or (stripe_refund_id is not null and refund_amount_cents is not null));

alter table public.subscriptions
  drop constraint if exists subscriptions_status_check;

alter table public.subscriptions
  add constraint subscriptions_status_check
  check (status = any (array[
    'active', 'trialing', 'past_due', 'canceled',
    'incomplete', 'incomplete_expired', 'unpaid', 'none'
  ]));

comment on column public.mobile_iap_accounts.renewal_state_signed_at is
  'Signature time of the newest App Store notice that set cancel_at_period_end for this account.';

delete from public.schema_migrations
 where filename = '0362_store_refund_and_pause_states.sql';

commit;
