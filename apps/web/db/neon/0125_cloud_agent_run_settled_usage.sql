-- 0125 — Per-run settled provider usage and charged cost for Managed Cloud runs.
--
-- A run settles once per managed-usage idempotency key: a plain turn settles
-- once, a run that pauses for tool approval settles again on every resume.
-- Keying the recorded usage by that key is what makes the write idempotent —
-- a retried settlement overwrites its own entry instead of double-counting,
-- while genuinely separate resumes still add up when the row is read.

alter table public.cloud_agent_runs
  add column settled_usage jsonb not null default '{}'::jsonb
    check (jsonb_typeof(settled_usage) = 'object');

comment on column public.cloud_agent_runs.settled_usage is
  'Managed-usage idempotency key -> {providerCalls, inputTokens, outputTokens, reasoningTokens, costCents, settledAt} for each settlement of this run.';
