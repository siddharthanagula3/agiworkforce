-- =============================================================================
-- 0130 — prompt-cache and compaction token classes as their own cost dimensions
--
-- 0127 records what a settled operation cost and how many units it bought, but
-- for chat those units are one undifferentiated token count. A cache hit, a
-- cache write and a turn whose history was compacted away all land in the same
-- number, so "what did prompt caching save us" and "what does compaction cost
-- us in re-read context" had no answer other than a log line.
--
-- These columns annotate the row they sit on; they are NOT additive to units,
-- provider_cost_cents or billed_cents. cache_savings_cents and
-- cache_write_premium_cents are counterfactuals — what the same tokens would
-- have cost at the uncached input rate — which is why cogs_summary reports
-- them beside gross margin and never inside it. Double counting is prevented by
-- keeping the money columns untouched, not by subtracting these back out.
-- =============================================================================

begin;

alter table if exists public.provider_cost_events
  add column if not exists cache_read_units numeric(20, 6) not null default 0
    check (cache_read_units >= 0);

alter table if exists public.provider_cost_events
  add column if not exists cache_write_units numeric(20, 6) not null default 0
    check (cache_write_units >= 0);

alter table if exists public.provider_cost_events
  add column if not exists compaction_saved_units numeric(20, 6) not null default 0
    check (compaction_saved_units >= 0);

alter table if exists public.provider_cost_events
  add column if not exists cache_savings_cents integer not null default 0
    check (cache_savings_cents >= 0);

alter table if exists public.provider_cost_events
  add column if not exists cache_write_premium_cents integer not null default 0
    check (cache_write_premium_cents >= 0);

-- The return type gains columns, which `create or replace` cannot do.
drop function if exists public.cogs_summary(timestamptz, timestamptz);

create or replace function public.cogs_summary(p_start timestamptz, p_end timestamptz)
returns table(
  provider_cost_cents bigint,
  billed_cents bigint,
  stripe_fee_cents bigint,
  refund_cents bigint,
  chargeback_cents bigint,
  chargeback_reserve_cents bigint,
  discount_cents bigint,
  support_adjustment_cents bigint,
  tax_cents bigint,
  gross_margin_cents bigint,
  cache_read_units numeric,
  cache_write_units numeric,
  compaction_saved_units numeric,
  cache_savings_cents bigint,
  cache_write_premium_cents bigint
)
language sql
stable
as $$
  with spend as (
    select coalesce(sum(event.provider_cost_cents), 0)::bigint as provider_cost,
           coalesce(sum(event.billed_cents), 0)::bigint as billed,
           coalesce(sum(event.cache_read_units), 0)::numeric as cache_read,
           coalesce(sum(event.cache_write_units), 0)::numeric as cache_write,
           coalesce(sum(event.compaction_saved_units), 0)::numeric as compaction_saved,
           coalesce(sum(event.cache_savings_cents), 0)::bigint as cache_savings,
           coalesce(sum(event.cache_write_premium_cents), 0)::bigint as cache_write_premium
      from public.provider_cost_events event
     where event.occurred_at >= p_start
       and event.occurred_at < p_end
  ), adjustment as (
    select entry.kind, coalesce(sum(entry.amount_cents), 0)::bigint as amount
      from public.cogs_adjustments entry
     where entry.occurred_at >= p_start
       and entry.occurred_at < p_end
     group by entry.kind
  ), totals as (
    select
      spend.provider_cost,
      spend.billed,
      spend.cache_read,
      spend.cache_write,
      spend.compaction_saved,
      spend.cache_savings,
      spend.cache_write_premium,
      coalesce((select amount from adjustment where kind = 'stripe_fee'), 0) as stripe_fee,
      coalesce((select amount from adjustment where kind = 'refund'), 0) as refund,
      coalesce((select amount from adjustment where kind = 'chargeback'), 0) as chargeback,
      coalesce((select amount from adjustment where kind = 'chargeback_reserve'), 0) as reserve,
      coalesce((select amount from adjustment where kind = 'discount'), 0) as discount,
      coalesce((select amount from adjustment where kind = 'support_adjustment'), 0) as support,
      coalesce((select amount from adjustment where kind = 'tax'), 0) as tax
    from spend
  )
  select
    totals.provider_cost,
    totals.billed,
    totals.stripe_fee,
    totals.refund,
    totals.chargeback,
    totals.reserve,
    totals.discount,
    totals.support,
    totals.tax,
    totals.billed
      - totals.provider_cost
      - totals.stripe_fee
      - totals.refund
      - totals.chargeback
      - totals.reserve
      - totals.discount
      - totals.support,
    totals.cache_read,
    totals.cache_write,
    totals.compaction_saved,
    totals.cache_savings,
    totals.cache_write_premium
  from totals;
$$;

comment on column public.provider_cost_events.cache_savings_cents is
  'Counterfactual: what this row''s cache-read tokens would have cost at the uncached input rate, minus what they did cost. Never added to provider_cost_cents or billed_cents.';

comment on column public.provider_cost_events.compaction_saved_units is
  'Tokens context compaction removed before the request was sent. A saving in volume, not a charge.';

commit;
