-- Reversal of 0212 : remove routing decision traces and rollout benchmarks.
--
-- WHAT THIS COSTS: every recorded routing decision and every measured rollout
-- benchmark is deleted, so the cohort alerts lose their baseline and a pending
-- promotion loses the shadow and canary evidence it would have been judged on.
-- Routing itself is unaffected; decisions are simply no longer persisted.

begin;

drop index if exists public.idx_model_rollout_benchmarks_model_stage;
drop index if exists public.idx_model_rollout_benchmarks_window;
drop table if exists public.model_rollout_benchmarks;

drop index if exists public.idx_routing_decision_traces_user;
drop index if exists public.idx_routing_decision_traces_model_stage;
drop index if exists public.idx_routing_decision_traces_slot_cohort;
drop index if exists public.idx_routing_decision_traces_created;
drop table if exists public.routing_decision_traces;

delete from public.schema_migrations
 where filename = '0212_routing_decision_traces.sql';

commit;
