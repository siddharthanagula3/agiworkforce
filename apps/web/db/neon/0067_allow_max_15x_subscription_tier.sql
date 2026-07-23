-- 0067 — Keep the subscription constraint aligned with the shared billing catalog.
--
-- Max 15x is a self-serve paid tier. Stripe can successfully charge and update
-- the subscription, but the legacy constraint from 0046 predates this tier and
-- rejects the canonical webhook upsert.

alter table public.subscriptions
  drop constraint if exists subscriptions_plan_tier_check,
  add constraint subscriptions_plan_tier_check
  check (plan_tier = any (array[
    'free'::text,
    'hobby'::text,
    'basic'::text,
    'pro'::text,
    'max'::text,
    'max_15x'::text,
    'team'::text,
    'enterprise'::text
  ]));
