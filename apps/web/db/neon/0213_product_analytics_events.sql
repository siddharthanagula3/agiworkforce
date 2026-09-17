-- 0213 : the one product analytics event stream every surface writes to, and
--        the daily metric snapshots computed from it and from the billing rows.
--
-- NOT YET APPLIED : draft only, pending explicit approval before running.
--
-- Nothing in the product recorded that a signup happened, that a first chat
-- landed, or that a tool call failed. usage_events is metering, one row per
-- billable unit; provider_cost_events is money after settlement. Neither can
-- answer "did this account ever come back", so DAU, retention and every
-- quality rate in §102 had no source at all.
--
-- Every row here is written only after public.consent_records says the subject
-- granted the product_analytics purpose, and the ingest re-reads that ledger
-- per request rather than trusting a client flag. Properties are an allowlist
-- of low-cardinality dimensions in the shared contract, so no prompt, file name
-- or address can reach this table.
--
-- product_metric_days is what the daily rollup measures. It exists because the
-- facts it needs do not survive: subscriptions carries one row per user that is
-- overwritten on every plan change, so yesterday's paid count is unrecoverable
-- tomorrow, and churn and expansion cannot be derived after the fact. The
-- snapshot holds no user id, which is also why the raw stream above can be
-- purged on a short window without losing the series.
--
-- Operational telemetry, service context only, no privileges to app_rls
-- (0089). Rows older than the retention window are deleted by the rollup cron,
-- and account erasure deletes the subject's rows.

begin;

create table if not exists public.product_analytics_events (
  id uuid primary key default gen_random_uuid(),
  user_id text,
  organization_id uuid references public.organizations(id) on delete set null,
  event_name text not null check (char_length(event_name) between 1 and 64),
  surface text not null check (char_length(surface) between 1 and 16),
  outcome text check (outcome is null or char_length(outcome) <= 16),
  properties jsonb not null default '{}'::jsonb check (jsonb_typeof(properties) = 'object'),
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_product_analytics_events_name_occurred
  on public.product_analytics_events (event_name, occurred_at desc);

create index if not exists idx_product_analytics_events_occurred
  on public.product_analytics_events (occurred_at);

create index if not exists idx_product_analytics_events_user
  on public.product_analytics_events (user_id, event_name, occurred_at desc)
  where user_id is not null;

revoke all on public.product_analytics_events from app_rls;

create table if not exists public.product_metric_days (
  metric_day date not null,
  metric text not null check (char_length(metric) between 1 and 64),
  scope text not null default 'all' check (char_length(scope) between 1 and 64),
  numerator numeric(20, 4) not null default 0,
  denominator numeric(20, 4) not null default 0,
  value numeric(20, 6),
  computed_at timestamptz not null default now(),
  constraint product_metric_days_pkey primary key (metric_day, metric, scope)
);

create index if not exists idx_product_metric_days_metric
  on public.product_metric_days (metric, metric_day desc);

revoke all on public.product_metric_days from app_rls;

commit;
