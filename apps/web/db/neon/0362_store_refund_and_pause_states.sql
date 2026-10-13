-- =============================================================================
-- Migration 0362: store purchase states the schema refused
--
-- Why    : a charge taken by the App Store or Google Play that this ledger
--          would not grant is filed in billing_refund_requests under a charge
--          id of the form mobile_iap:<platform>:<store transaction>. It is
--          refunded at the store, so no Stripe refund ever exists for it, and
--          0299 refused status 'refunded' without a Stripe refund id. The only
--          way out of the queue was to decline a request that had in fact been
--          refunded.
--
--          Separately, a subscription the customer pauses in Google Play is
--          recorded as status 'paused', which keeps the plan on record and
--          grants nothing. subscriptions_status_check never listed it, so the
--          Play pause notice failed its update and was redelivered without end
--          while the paused plan kept its access.
--
-- Shape  : the refund-is-recorded check still demands an amount for every
--          refunded request and a Stripe refund id for every Stripe charge. A
--          store charge may be refunded with the amount alone.
--
--          subscriptions_status_check gains 'paused'. No reader treats it as
--          entitled: access is granted on 'active' and 'trialing' only.
--
--          The comment on mobile_iap_accounts.renewal_state_signed_at is
--          corrected: Google Play notices now order the auto-renew choice by
--          their event time through the same column.
--
-- Access : no policy, grant or row changes.
--
-- Depends: 0003 (subscriptions), 0299 (billing_refund_requests),
--          0361 (renewal_state_signed_at)
-- =============================================================================

begin;

alter table public.billing_refund_requests
  drop constraint if exists billing_refund_requests_refund_is_recorded;

alter table public.billing_refund_requests
  add constraint billing_refund_requests_refund_is_recorded
  check (
    status <> 'refunded'
    or (
      refund_amount_cents is not null
      and (stripe_refund_id is not null or starts_with(charge_id, 'mobile_iap:'))
    )
  );

alter table public.subscriptions
  drop constraint if exists subscriptions_status_check;

alter table public.subscriptions
  add constraint subscriptions_status_check
  check (status = any (array[
    'active', 'trialing', 'past_due', 'paused', 'canceled',
    'incomplete', 'incomplete_expired', 'unpaid', 'none'
  ]));

comment on column public.mobile_iap_accounts.renewal_state_signed_at is
  'Event time of the newest store notice that set cancel_at_period_end for this account: the App Store signature time, or the Google Play event time.';

commit;
