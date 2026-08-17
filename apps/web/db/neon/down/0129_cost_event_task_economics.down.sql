-- Reversal of 0129 — drop the task dimension from the cost ledger.
--
-- WHAT THIS COSTS: every recorded task attribution is destroyed. The cost rows
-- survive, but cost per delivered task, repeat cost and undelivered cost become
-- unanswerable again for the whole history, not just going forward.

BEGIN;

drop function if exists public.task_economics(timestamptz, timestamptz);

drop index if exists public.idx_provider_cost_events_task_outcome;
drop index if exists public.idx_provider_cost_events_task_ref;

alter table public.provider_cost_events
  drop constraint if exists provider_cost_events_task_outcome_check;

alter table public.provider_cost_events
  drop column if exists task_outcome;

alter table public.provider_cost_events
  drop column if exists task_ref;

delete from public.schema_migrations where filename = '0129_cost_event_task_economics.sql';

COMMIT;
