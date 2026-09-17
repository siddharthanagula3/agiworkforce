-- 0212 : a persisted, structured record of every Auto routing decision, and the
--        rollout benchmarks measured from those records per lifecycle stage.
--
-- NOT YET APPLIED : draft only, pending explicit approval before running.
--
-- The router already explains itself in memory: a reason, a fallback plan, the
-- refusal reasons of an unavailable decision. None of it outlived the request,
-- so "why did this turn land on that model" and "is the canary worse than the
-- model it may replace" had no answer after the fact.
--
-- provider_cost_events is not reused for this. It records money that left the
-- building after settlement, so a decision that found no route, a turn that
-- failed before any spend, and time to first token are all absent from it, and
-- those are exactly what a rollout is judged on. The trace row carries the
-- decision, then the served turn completes it with outcome, latency and cost.
--
-- kind 'shadow' is a mirrored request: never served, never billed to the user,
-- metered as platform cost, and compared with the served turn of the same
-- request id.
--
-- model_rollout_benchmarks is what the rollout cron measures from these rows for
-- each model at each lifecycle stage and cohort, so a promotion carries the
-- evidence of its shadow and canary stages rather than a stage label alone.
--
-- Operational telemetry, service context only, no privileges to app_rls
-- (0089). Rows older than the retention window are deleted by the rollout cron,
-- and account erasure deletes the subject's rows.

begin;

create table if not exists public.routing_decision_traces (
  id uuid primary key default gen_random_uuid(),
  request_id text not null check (char_length(request_id) between 1 and 200),
  user_id text,
  organization_id uuid references public.organizations(id) on delete set null,
  surface text not null check (char_length(surface) between 1 and 64),
  kind text not null default 'served' check (kind = any (array['served', 'shadow'])),
  status text not null check (status = any (array['selected', 'unavailable'])),
  selection text not null check (char_length(selection) between 1 and 200),
  task_type text not null check (char_length(task_type) between 1 and 64),
  reason text check (reason is null or char_length(reason) <= 64),
  code text check (code is null or char_length(code) <= 64),
  model_key text check (model_key is null or char_length(model_key) <= 200),
  provider text check (provider is null or char_length(provider) <= 100),
  route_id text check (route_id is null or char_length(route_id) <= 300),
  slot_id text check (slot_id is null or char_length(slot_id) <= 120),
  cohort text check (cohort is null or cohort = any (array['control', 'canary'])),
  lifecycle_stage text check (lifecycle_stage is null or char_length(lifecycle_stage) <= 32),
  region text check (region is null or char_length(region) <= 16),
  flag_variants jsonb not null default '{}'::jsonb check (jsonb_typeof(flag_variants) = 'object'),
  trace jsonb not null check (jsonb_typeof(trace) = 'object'),
  outcome text check (outcome is null or outcome = any (array['succeeded', 'failed'])),
  error_code text check (error_code is null or char_length(error_code) <= 100),
  ttft_ms integer check (ttft_ms is null or ttft_ms >= 0),
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  provider_cost_microusd bigint check (provider_cost_microusd is null or provider_cost_microusd >= 0),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint routing_decision_traces_request_kind_unique unique (request_id, kind)
);

create index if not exists idx_routing_decision_traces_created
  on public.routing_decision_traces (created_at);

create index if not exists idx_routing_decision_traces_slot_cohort
  on public.routing_decision_traces (slot_id, cohort, created_at desc)
  where slot_id is not null;

create index if not exists idx_routing_decision_traces_model_stage
  on public.routing_decision_traces (model_key, lifecycle_stage, kind, created_at desc)
  where model_key is not null;

create index if not exists idx_routing_decision_traces_user
  on public.routing_decision_traces (user_id)
  where user_id is not null;

revoke all on public.routing_decision_traces from app_rls;

create table if not exists public.model_rollout_benchmarks (
  id uuid primary key default gen_random_uuid(),
  model_key text not null check (char_length(model_key) between 1 and 200),
  lifecycle_stage text not null check (char_length(lifecycle_stage) between 1 and 32),
  slot_id text check (slot_id is null or char_length(slot_id) <= 120),
  cohort text not null check (cohort = any (array['control', 'canary', 'shadow'])),
  window_start timestamptz not null,
  window_end timestamptz not null,
  sample_count integer not null check (sample_count >= 0),
  failure_rate numeric(6, 5) check (failure_rate is null or failure_rate between 0 and 1),
  latency_p50_ms integer check (latency_p50_ms is null or latency_p50_ms >= 0),
  latency_p95_ms integer check (latency_p95_ms is null or latency_p95_ms >= 0),
  cost_per_request_microusd bigint check (
    cost_per_request_microusd is null or cost_per_request_microusd >= 0
  ),
  created_at timestamptz not null default now(),
  constraint model_rollout_benchmarks_window_order check (window_end > window_start)
);

create unique index if not exists idx_model_rollout_benchmarks_window
  on public.model_rollout_benchmarks (
    model_key, lifecycle_stage, cohort, coalesce(slot_id, ''), window_start
  );

create index if not exists idx_model_rollout_benchmarks_model_stage
  on public.model_rollout_benchmarks (model_key, lifecycle_stage, window_end desc);

revoke all on public.model_rollout_benchmarks from app_rls;

commit;
