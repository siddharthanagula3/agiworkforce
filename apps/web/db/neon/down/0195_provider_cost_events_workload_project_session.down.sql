-- Reversal of 0195 : stop attributing cost events to workload, project and session.
--
-- WHAT THIS COSTS: every recorded attribution is dropped and cannot be rebuilt
-- from the remaining columns. Costs, charges and margins are unchanged.

begin;

drop index if exists public.idx_provider_cost_events_org_project_occurred;
drop index if exists public.idx_provider_cost_events_org_workload_occurred;

alter table public.provider_cost_events
  drop column if exists session_id,
  drop column if exists project_id,
  drop column if exists workload;

delete from public.schema_migrations
 where filename = '0195_provider_cost_events_workload_project_session.sql';

commit;
