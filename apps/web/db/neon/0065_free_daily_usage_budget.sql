-- 0065_free_daily_usage_budget.sql
--
-- Founder decision 2026-07-18: Free managed chat is paced by one private
-- internal usage unit per rolling day. The cents ledger cannot represent that
-- amount exactly, so Free keeps a separate micro-USD cost counter. Exact
-- values remain server-only and clients receive percentages/reset times only.
--
-- Apply after 0064 and before deploying code that reads these columns.

alter table public.website_auto_economy_trial_usage
  add column if not exists daily_cost_microusd bigint not null default 0
    check (daily_cost_microusd >= 0),
  add column if not exists daily_reserved_microusd bigint not null default 0
    check (daily_reserved_microusd >= 0),
  add column if not exists daily_started_at timestamptz not null default now();

create table if not exists public.free_daily_usage_reservations (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.profiles(id) on delete cascade,
  request_id text not null,
  window_started_at timestamptz not null,
  reserved_microusd bigint not null check (reserved_microusd > 0),
  actual_cost_microusd bigint check (actual_cost_microusd >= 0),
  outcome text check (outcome is null or outcome = any (array[
    'completed',
    'failed',
    'cancelled'
  ])),
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, request_id)
);

create index if not exists idx_free_daily_usage_reservations_unsettled
  on public.free_daily_usage_reservations (created_at)
  where settled_at is null;

alter table public.free_daily_usage_reservations enable row level security;
alter table public.free_daily_usage_reservations force row level security;

drop policy if exists free_daily_usage_reservations_user_isolation
  on public.free_daily_usage_reservations;
create policy free_daily_usage_reservations_user_isolation
  on public.free_daily_usage_reservations
  using (user_id = public.current_app_user_id())
  with check (user_id = public.current_app_user_id());

revoke all on public.free_daily_usage_reservations from public;
grant select, insert, update on public.free_daily_usage_reservations to app_rls;

create unique index if not exists usage_events_free_daily_settlement_request_id_unique
  on public.usage_events (user_id, (metadata ->> 'requestId'))
  where event_type = 'website_auto_economy_trial_usage_settled';

comment on column public.website_auto_economy_trial_usage.daily_cost_microusd is
  'Private rolling-day managed-provider cost counter; never serialize this value to clients.';

comment on column public.website_auto_economy_trial_usage.daily_started_at is
  'Start of the current private Free managed-usage window.';

comment on column public.website_auto_economy_trial_usage.daily_reserved_microusd is
  'Private active provider-cost reservation total for the current rolling day.';

comment on table public.free_daily_usage_reservations is
  'Durable, idempotent Free managed-usage reservations. Never expose monetary values to clients.';
