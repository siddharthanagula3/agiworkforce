-- Migration 0030: allow enterprise subscription tier in Neon
--
-- Stripe price mapping can resolve configured enterprise prices to
-- plan_tier='enterprise'. Keep the database check constraint aligned with the
-- runtime billing catalog.

ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_plan_tier_check,
  ADD CONSTRAINT subscriptions_plan_tier_check
  CHECK (plan_tier = ANY (ARRAY[
    'free'::text,
    'hobby'::text,
    'pro'::text,
    'max'::text,
    'enterprise'::text
  ]));
