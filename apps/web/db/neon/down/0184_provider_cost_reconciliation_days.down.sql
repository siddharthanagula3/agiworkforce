-- Reversal of 0184 : drop the provider-reported daily cost table.
--
-- WHAT THIS COSTS: every provider figure fetched since 0184 applied is lost,
-- and the OpenAI and Anthropic cost endpoints only answer for a bounded
-- window, so a day dropped here is a day no re-fetch can recover once that
-- window passes. The estimate in provider_cost_events survives untouched;
-- what disappears is the only independent number to score it against.

begin;

drop table if exists public.provider_cost_reconciliation_days;

delete from public.schema_migrations
  where filename = '0184_provider_cost_reconciliation_days.sql';

commit;
