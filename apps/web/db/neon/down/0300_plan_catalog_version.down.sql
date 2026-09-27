-- Reversal of 0300 : removes the plan catalog version from subscriptions and
-- credit periods.
--
-- WHAT THIS COSTS: the record of which catalog each subscription was sold under
-- is deleted, so every subscriber falls back to the current catalog's credits
-- and window caps at the next allocation. While only version 1 exists that
-- changes nothing anyone receives; after a reprice it silently moves every
-- grandfathered subscriber onto the new allowances. Balances, usage and the
-- ledger are untouched.

begin;

alter table public.token_credits
  drop constraint if exists token_credits_plan_catalog_version_positive;
alter table public.token_credits
  drop column if exists plan_catalog_version;

alter table public.subscriptions
  drop constraint if exists subscriptions_plan_catalog_version_positive;
alter table public.subscriptions
  drop column if exists plan_catalog_version;

delete from public.schema_migrations
 where filename = '0300_plan_catalog_version.sql';

commit;
