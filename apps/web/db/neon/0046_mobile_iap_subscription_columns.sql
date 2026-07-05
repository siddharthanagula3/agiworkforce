-- Migration 0046 — mobile in-app-purchase receipt reconciliation columns.
--
-- Adds the Apple/Google purchase identifiers needed by
-- POST /api/mobile/iap/verify (apps/web/app/api/mobile/iap/verify/route.ts)
-- so a mobile-purchased subscription upserts into the SAME `subscriptions`
-- row/table that Stripe checkout writes to (see
-- apps/web/app/api/stripe-webhook/lib/db.ts), not a parallel tier system.
--
-- apple_original_transaction_id: StoreKit's stable subscription identifier —
--   stays constant across renewals/plan-changes for one subscription, unlike
--   `transactionId` which changes every renewal. Mirrors how
--   `stripe_subscription_id` anchors the Stripe side.
-- google_purchase_token: Play Billing's purchase token for the subscription.
--   Google recommends treating this as the durable identifier for a
--   subscription purchase (it can be replaced on plan change via
--   `linkedPurchaseToken`, but is stable for verify/reconcile calls).
--
-- Both are nullable + unique: a given subscription row is either
-- Stripe-billed, Apple-billed, or Google-billed, never more than one of each.
--
-- APPLIED to production — confirmed 2026-07-04 (columns + widened
-- plan_tier constraint verified present on the production branch).

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS apple_original_transaction_id text UNIQUE,
  ADD COLUMN IF NOT EXISTS google_purchase_token text UNIQUE;

CREATE INDEX IF NOT EXISTS idx_subscriptions_apple_original_transaction_id
  ON public.subscriptions(apple_original_transaction_id)
  WHERE apple_original_transaction_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_subscriptions_google_purchase_token
  ON public.subscriptions(google_purchase_token)
  WHERE google_purchase_token IS NOT NULL;

-- The plan_tier check constraint (last touched in migration 0030) predates
-- the 2026-07-02 pricing rename in packages/types/src/billing-catalog.ts,
-- which replaced 'hobby' with 'basic' and added 'team'. Mobile IAP can
-- purchase 'basic' and 'team' (apps/mobile/src/features/billing/iapProducts.ts),
-- so without this the very first mobile-IAP upsert for those tiers would
-- fail the CHECK constraint. 'hobby' is kept for backward compatibility with
-- any existing rows/mapping code that still writes it.
ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_plan_tier_check,
  ADD CONSTRAINT subscriptions_plan_tier_check
  CHECK (plan_tier = ANY (ARRAY[
    'free'::text,
    'hobby'::text,
    'basic'::text,
    'pro'::text,
    'max'::text,
    'team'::text,
    'enterprise'::text
  ]));
