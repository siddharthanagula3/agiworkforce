-- =============================================================================
-- Migration 0300: the plan catalog version a subscription was sold under
--
-- Why    : a retired plan or price kept only its Stripe price and stored tier;
--          credits and window caps always followed today's catalog, so a
--          reprice silently rewrote what an existing subscriber had bought.
--
-- Shape  : subscriptions.plan_catalog_version is recorded at purchase and kept
--          at each renewal while the subscription stays on the same price; a
--          price change records the current version. token_credits carries the
--          version its period was allocated under, which is what the reservation
--          path reads for the 5-hour and weekly caps, including for a seat
--          member who cannot read the owner's subscription row. NULL means the
--          current catalog. The allowances per version live in
--          packages/contracts/types/src/managed-usage-limits.ts.
--
-- Backfill: every paid subscription and its open credit period predate any
--          reprice, so they were sold under version 1.
--
-- Depends: 0003 (subscriptions), 0004 (token_credits)
-- =============================================================================

begin;

alter table public.subscriptions
  add column if not exists plan_catalog_version integer
    constraint subscriptions_plan_catalog_version_positive
      check (plan_catalog_version is null or plan_catalog_version >= 1);

alter table public.token_credits
  add column if not exists plan_catalog_version integer
    constraint token_credits_plan_catalog_version_positive
      check (plan_catalog_version is null or plan_catalog_version >= 1);

update public.subscriptions
   set plan_catalog_version = 1
 where plan_catalog_version is null
   and plan_tier is not null
   and plan_tier <> 'free';

update public.token_credits credits
   set plan_catalog_version = subscription.plan_catalog_version
  from public.subscriptions subscription
 where subscription.id = credits.subscription_id
   and credits.plan_catalog_version is null
   and subscription.plan_catalog_version is not null
   and credits.period_end > now();

comment on column public.subscriptions.plan_catalog_version is
  'The billing plan catalog version this subscription was sold under. Kept across renewals on the same price, replaced by the current version when the price changes. NULL follows the current catalog.';
comment on column public.token_credits.plan_catalog_version is
  'The catalog version whose allowances this credit period was allocated under; the reservation path reads it for the rolling window caps. NULL follows the current catalog.';

commit;

-- =============================================================================
-- VERIFICATION, run MANUALLY on a throwaway Neon BRANCH before production.
-- =============================================================================
-- -- 1. No paid subscription is left without a version:
-- --    SELECT count(*) FROM public.subscriptions
-- --     WHERE plan_tier <> 'free' AND plan_catalog_version IS NULL;  -- EXPECT 0
-- -- 2. A version below 1 is refused:
-- --    UPDATE public.subscriptions SET plan_catalog_version = 0 WHERE false;
-- --    UPDATE public.subscriptions SET plan_catalog_version = 0
-- --     WHERE id = (SELECT id FROM public.subscriptions LIMIT 1);
-- --    EXPECT: ERROR violates check constraint "subscriptions_plan_catalog_version_positive"
-- =============================================================================
