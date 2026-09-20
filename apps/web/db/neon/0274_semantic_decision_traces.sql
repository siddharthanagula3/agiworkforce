-- 0274 : the shadow record for semantic decisions, and the ledger line that
--        says what asking one cost.
--
-- NOT YET APPLIED : draft only, pending explicit approval before running.
--
-- A semantic decision is a bounded typed question answered by an external
-- evaluator: which task family this turn is, whether it needs current web
-- information, how much reasoning it takes. Nothing in this migration changes
-- what a request does. The evaluator runs in shadow behind a flag that is off,
-- and the deterministic classifier keeps the turn either way.
--
--   'decision'   the COGS capability for that call. Recorded under 'chat' the
--                row would land in the per-turn margin question with tokens
--                that bought no answer for the user; recorded under 'tool' it
--                would join purchases made on the user's behalf, which this is
--                not. It is platform cost: billed_cents is always zero and no
--                customer charge is ever derived from it.
--
--   semantic_decision_traces   one row per evaluation, so "did the evaluator
--                agree with the classifier, and how sure was it" has an answer
--                after the fact. routing_decision_traces is not reused: its
--                NOT NULL model_key/provider/route_id and its RoutingDecisionTrace
--                JSON describe a model route, and a baseline-versus-candidate
--                comparison is not one.
--
-- WHAT THIS TABLE HOLDS, AND WHAT IT JOINS TO
-- Every column is a bounded label or a bin from a closed vocabulary decided in
-- code: the decision kind, the mode, the question key, the two answers as
-- enum labels, whether they agreed, a confidence bin, a fallback reason, the
-- model version, a latency and an input-token count. The state the question
-- was asked about is never written, nor a candidate description, a message, a
-- user id or an organization id.
--
-- It is NOT anonymous, and the claim is not made. It carries no subject or
-- tenant column OF ITS OWN, and two columns join out to rows that do have one,
-- deliberately, because a disagreement that cannot be priced against the route
-- that was served is not worth recording:
--
--   request_id   joins routing_decision_traces.request_id (0212), which carries
--                user_id and organization_id. Both tables are swept on the same
--                retention window by the model-rollout cron, so the join closes
--                when they retire together. Account erasure DELETES a subject's
--                routing traces outright (USER_SCOPED_TABLES), so this join goes
--                with the account.
--
--   decision_id  is the source_ref of this evaluation's provider_cost_events row
--                (capability 'decision'), which carries user_id and
--                organization_id. That ledger row has no maximum age and is
--                anonymised rather than deleted on account erasure (user_id set
--                null, organization_id detached on workspace erasure), so this
--                join outlives the trace's own window but names nobody once the
--                subject is erased.
--
-- So: linkable to a subject while a row naming that subject survives, and not
-- linkable afterwards. It is deliberately absent from USER_SCOPED_TABLES and
-- from the erasure cascades: it has no column for them to act on, and both
-- tables it joins to are erased or anonymised in their own right.
--
-- Operational telemetry, service context only, no privileges to app_rls
-- (0089), and RLS is forced so a future app_rls grant cannot quietly open it.
--
-- Depends: 0246
-- =============================================================================

begin;

alter table public.provider_cost_events
  drop constraint if exists provider_cost_events_capability_check;

alter table public.provider_cost_events
  add constraint provider_cost_events_capability_check check (capability = any (array[
    'chat', 'image', 'video', 'transcription', 'embedding', 'computer_use', 'sandbox', 'tool',
    'storage', 'database', 'vector', 'notification', 'email', 'egress', 'browser',
    'work_compute', 'code_compute', 'connector', 'artifact', 'visual', 'decision'
  ]));

create table if not exists public.semantic_decision_traces (
  id uuid primary key default gen_random_uuid(),
  decision_id text not null check (char_length(decision_id) between 1 and 200),
  request_id text not null check (char_length(request_id) between 1 and 200),
  decision_kind text not null check (char_length(decision_kind) between 1 and 64),
  mode text not null check (mode = any (array['served', 'shadow'])),
  question_key text not null check (char_length(question_key) between 1 and 64),
  baseline_value text check (baseline_value is null or char_length(baseline_value) <= 64),
  candidate_value text check (candidate_value is null or char_length(candidate_value) <= 64),
  agree boolean,
  confidence_bin text check (confidence_bin is null or char_length(confidence_bin) <= 16),
  probability_bin text check (probability_bin is null or char_length(probability_bin) <= 16),
  fallback_reason text check (fallback_reason is null or char_length(fallback_reason) <= 32),
  model text check (model is null or char_length(model) <= 200),
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  input_tokens integer check (input_tokens is null or input_tokens >= 0),
  created_at timestamptz not null default now(),
  constraint semantic_decision_traces_question_unique unique (decision_id, question_key)
);

comment on table public.semantic_decision_traces is
  'One row per semantic decision question: the deterministic answer, the evaluator answer, whether they agreed, and a confidence bin. Bounded labels only, no state and no candidate text, and no subject or tenant column of its own. Not anonymous: request_id joins routing_decision_traces, and decision_id is the source_ref of the provider_cost_events row for the same evaluation; both of those carry user_id and organization_id. The join is deliberate, it is how a disagreement is priced against the route that was served. Swept on the same retention window as the routing traces by the model-rollout cron, and the routing trace is deleted outright by account erasure.';

comment on column public.semantic_decision_traces.baseline_value is
  'The answer the deterministic path gave, as a label from that path own closed vocabulary. Null where the question has no deterministic counterpart.';

comment on column public.semantic_decision_traces.mode is
  'shadow means the answer was recorded and discarded; served means a caller acted on it. Every row is shadow until a decision kind is switched on.';

create index if not exists idx_semantic_decision_traces_created
  on public.semantic_decision_traces (created_at);

create index if not exists idx_semantic_decision_traces_kind_question
  on public.semantic_decision_traces (decision_kind, question_key, created_at desc);

-- 0037 hands every new table full DML through ALTER DEFAULT PRIVILEGES, and
-- platform telemetry is not tenant-readable at all.
revoke all on public.semantic_decision_traces from app_rls;

alter table public.semantic_decision_traces enable row level security;
alter table public.semantic_decision_traces force row level security;

commit;

-- =============================================================================
-- VERIFICATION : run MANUALLY on a throwaway Neon BRANCH before production.
-- =============================================================================
-- -- 1. The new capability is accepted and carries no customer charge:
-- --    INSERT INTO public.provider_cost_events
-- --      (capability, provider, unit_basis, units, provider_cost_cents, billed_cents, source_ref)
-- --    VALUES ('decision', 'typesafe', 'token', 420, 0, 0, 'verify:decision');
-- --    EXPECT: INSERT 0 1
--
-- -- 2. An unknown capability is still refused:
-- --    INSERT INTO public.provider_cost_events
-- --      (capability, provider, unit_basis, units, provider_cost_cents, billed_cents, source_ref)
-- --    VALUES ('nonsense', 'typesafe', 'token', 1, 0, 0, 'verify:bad');
-- --    EXPECT: ERROR new row violates check constraint
--
-- -- 3. A trace row is idempotent per decision and question:
-- --    INSERT INTO public.semantic_decision_traces
-- --      (decision_id, request_id, decision_kind, mode, question_key)
-- --    VALUES ('verify-1', 'req-1', 'turn_signals', 'shadow', 'task_family')
-- --    ON CONFLICT (decision_id, question_key) DO NOTHING;
-- --    EXPECT: INSERT 0 1, then INSERT 0 0 on a repeat.
--
-- -- 4. An unknown mode is refused:
-- --    INSERT INTO public.semantic_decision_traces
-- --      (decision_id, request_id, decision_kind, mode, question_key)
-- --    VALUES ('verify-2', 'req-2', 'turn_signals', 'live', 'task_family');
-- --    EXPECT: ERROR new row violates check constraint
--
-- -- 5. The tenant role cannot read it:
-- --    SET ROLE app_rls; SELECT * FROM public.semantic_decision_traces;
-- --    EXPECT: ERROR permission denied for table semantic_decision_traces
-- --    RESET ROLE;
--
-- -- 6. Clean up:
-- --    DELETE FROM public.provider_cost_events WHERE source_ref LIKE 'verify:%';
-- --    DELETE FROM public.semantic_decision_traces WHERE decision_id LIKE 'verify-%';
-- =============================================================================
