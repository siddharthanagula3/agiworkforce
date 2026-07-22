-- 0067 — Free managed-usage windows: 5 hours, 7 days, and account month.
--
-- Founder decision 2026-07-22: remove the rolling 24-hour cap. Every completed
-- response costs at least one internal unit. Free may use 5 units per rolling
-- 5 hours, 15 per rolling 7 days, and 20 per account-anniversary month.
-- Reservation rows are the authoritative ledger because they can represent
-- sub-cent units exactly and already preserve in-flight provider cost.

create index if not exists idx_free_usage_reservations_user_created
  on public.free_daily_usage_reservations (user_id, created_at desc)
  include (actual_cost_microusd, reserved_microusd, settled_at);

comment on table public.free_daily_usage_reservations is
  'Durable, idempotent Free managed-usage reservation ledger for rolling and account-month limits. Monetary operands are private.';

-- These columns remain for backward-compatible deploy ordering and historical
-- telemetry. Admission control no longer reads them after 0067.
comment on column public.website_auto_economy_trial_usage.daily_cost_microusd is
  'Legacy pre-0067 rolling-day aggregate; retained for compatible roll-forward deployments.';

comment on column public.website_auto_economy_trial_usage.daily_reserved_microusd is
  'Legacy pre-0067 rolling-day reservation aggregate; retained for compatible roll-forward deployments.';

comment on column public.website_auto_economy_trial_usage.daily_started_at is
  'Legacy pre-0067 rolling-day timestamp; retained for compatible roll-forward deployments.';
