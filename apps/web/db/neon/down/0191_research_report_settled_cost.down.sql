-- Reversal of 0191 : forget what a Deep Research run cost.
--
-- WHAT THIS COSTS: every report footer stops stating a cost; the ledger keeps
-- the settlement, so nothing about billing changes, only the report copy.

begin;

alter table public.research_reports
  drop constraint if exists research_reports_settled_cost_microusd_nonnegative;

alter table public.research_reports
  drop column if exists settled_cost_microusd;

delete from public.schema_migrations
 where filename = '0191_research_report_settled_cost.sql';

commit;
