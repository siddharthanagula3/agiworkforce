-- Reversal of 0130 — drop the prompt-cache and compaction cost dimensions and
-- restore the 0127 shape of cogs_summary.
--
-- WHAT THIS COSTS: every recorded cache-hit saving, cache-write premium and
-- compaction volume is destroyed. Provider spend, billed amounts and gross
-- margin are untouched, because these columns were never part of them.

begin;

alter table if exists public.provider_cost_events
  drop column if exists cache_write_premium_cents;

alter table if exists public.provider_cost_events
  drop column if exists cache_savings_cents;

alter table if exists public.provider_cost_events
  drop column if exists compaction_saved_units;

alter table if exists public.provider_cost_events
  drop column if exists cache_write_units;

alter table if exists public.provider_cost_events
  drop column if exists cache_read_units;

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
  gross_margin_cents bigint
)
language sql
stable
as $$
  with spend as (
    select coalesce(sum(event.provider_cost_cents), 0)::bigint as provider_cost,
           coalesce(sum(event.billed_cents), 0)::bigint as billed
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
      - totals.support
  from totals;
$$;

delete from public.schema_migrations where filename = '0130_cogs_token_classes.sql';

commit;
