-- 0191 : record what a Deep Research run cost, on the run's own row.
--
-- NOT YET APPLIED : draft only, pending explicit approval before running.
--
-- A finished report already says how many sources it read and how long it took.
-- It never said what the user paid for it, and the one place that number is
-- authoritative is the managed usage ledger's settlement, which happens after
-- the loop has written this row. Copying the settled amount here, in the
-- ledger's own unit, lets the report footer state the cost without a second
-- derivation from token counts that would be free to disagree with the ledger.
--
-- Nullable on purpose: a run whose settlement never completed (a released
-- reservation, a free-trial turn) has no settled amount, and rendering a
-- fabricated zero would be worse than rendering nothing.

begin;

alter table public.research_reports
  add column if not exists settled_cost_microusd bigint;

alter table public.research_reports
  drop constraint if exists research_reports_settled_cost_microusd_nonnegative;

alter table public.research_reports
  add constraint research_reports_settled_cost_microusd_nonnegative
  check (settled_cost_microusd is null or settled_cost_microusd >= 0);

comment on column public.research_reports.settled_cost_microusd is
  'What the managed usage ledger settled for this run, in microUSD. Null when the run was never settled through the ledger.';

commit;
