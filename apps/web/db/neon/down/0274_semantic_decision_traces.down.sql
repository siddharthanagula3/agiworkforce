-- Reversal of 0274 : removes the semantic decision shadow record and returns
-- the COGS capability set to 0246.
--
-- WHAT THIS COSTS: every recorded baseline-versus-candidate comparison is
-- deleted, so a decision kind waiting on shadow evidence loses the evidence and
-- has to gather it again. The ledger rows written under the 'decision'
-- capability are deleted too, because the narrower constraint cannot hold them;
-- that loses the platform cost of those evaluations from the margin view.
-- billed_cents on every one of them is zero, so no customer charge, credit
-- balance or invoice is derived from what is deleted here. Chat itself is
-- unaffected: the evaluator is shadow-only and the deterministic classifier
-- decides the turn either way.

begin;

drop index if exists public.idx_semantic_decision_traces_kind_question;
drop index if exists public.idx_semantic_decision_traces_created;
drop table if exists public.semantic_decision_traces;

delete from public.provider_cost_events
 where capability = 'decision';

alter table public.provider_cost_events
  drop constraint if exists provider_cost_events_capability_check;

alter table public.provider_cost_events
  add constraint provider_cost_events_capability_check check (capability = any (array[
    'chat', 'image', 'video', 'transcription', 'embedding', 'computer_use', 'sandbox', 'tool',
    'storage', 'database', 'vector', 'notification', 'email', 'egress', 'browser',
    'work_compute', 'code_compute', 'connector', 'artifact', 'visual'
  ]));

delete from public.schema_migrations
 where filename = '0274_semantic_decision_traces.sql';

commit;
