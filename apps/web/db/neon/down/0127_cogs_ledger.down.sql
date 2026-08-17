-- Reversal of 0127 — drop the cost-of-goods ledger.
--
-- WHAT THIS COSTS: every recorded provider cost event and every fee, refund,
-- chargeback, discount, tax and support adjustment written since 0127 is
-- destroyed. These are the only internal record of what managed cloud cost;
-- Stripe keeps its own side, the providers do not keep ours. Export both tables
-- before running this.

BEGIN;

drop function if exists public.cogs_summary(timestamptz, timestamptz);

drop index if exists public.idx_cogs_adjustments_occurred_at;
drop index if exists public.idx_cogs_adjustments_source_ref;
drop table if exists public.cogs_adjustments;

drop index if exists public.idx_provider_cost_events_capability;
drop index if exists public.idx_provider_cost_events_occurred_at;
drop index if exists public.idx_provider_cost_events_source_ref;
drop table if exists public.provider_cost_events;

delete from public.schema_migrations where filename = '0127_cogs_ledger.sql';

COMMIT;
