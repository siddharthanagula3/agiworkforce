-- 0127 — one cost-of-goods ledger for managed cloud.
--
-- Until now the only number the platform recorded per request was
-- actual_cost_cents on managed_usage_requests, which is what the CUSTOMER was
-- charged against their allowance. Nothing recorded what the request COST us,
-- and nothing recorded the non-token capabilities at all in cost terms: an
-- image is billed per image, a video per second, a transcription per minute of
-- audio, and none of those units appear anywhere a margin question can be
-- asked. Stripe's own deductions — processing fees, refunds, chargebacks,
-- discounts and support goodwill — lived only inside Stripe.
--
-- provider_cost_events is the per-capability cost record: what we bought, in
-- what unit, how much of it, what it cost, and what we billed for it.
-- cogs_adjustments is everything that moves margin but is not provider spend.
-- cogs_summary() is the single place both are added up, so "what did managed
-- cloud actually cost last month" has one answer rather than a spreadsheet.
--
-- Both tables are financial records. They keep a nullable user_id so a cost can
-- be attributed while the subject exists; account erasure nulls it and the cost
-- row survives, exactly as organization_usage_ledger already does.

begin;

create table if not exists public.provider_cost_events (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  user_id text,
  capability text not null check (capability = any (array[
    'chat', 'image', 'video', 'transcription', 'embedding', 'computer_use', 'sandbox'
  ])),
  provider text not null check (length(btrim(provider)) between 1 and 100),
  model text check (model is null or length(btrim(model)) between 1 and 200),
  unit_basis text not null check (unit_basis = any (array[
    'token', 'image', 'second', 'minute', 'request'
  ])),
  units numeric(20, 6) not null check (units >= 0),
  provider_cost_cents integer not null check (provider_cost_cents >= 0),
  billed_cents integer not null default 0 check (billed_cents >= 0),
  source_ref text not null check (length(btrim(source_ref)) between 1 and 400),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_provider_cost_events_source_ref
  on public.provider_cost_events (source_ref);

create index if not exists idx_provider_cost_events_occurred_at
  on public.provider_cost_events (occurred_at desc);

create index if not exists idx_provider_cost_events_capability
  on public.provider_cost_events (capability, occurred_at desc);

create table if not exists public.cogs_adjustments (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  user_id text,
  kind text not null check (kind = any (array[
    'stripe_fee', 'refund', 'chargeback', 'chargeback_reserve', 'discount',
    'support_adjustment', 'tax'
  ])),
  amount_cents integer not null check (amount_cents >= 0),
  currency text not null default 'usd' check (char_length(currency) = 3),
  source_ref text not null check (length(btrim(source_ref)) between 1 and 400),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_cogs_adjustments_source_ref
  on public.cogs_adjustments (kind, source_ref);

create index if not exists idx_cogs_adjustments_occurred_at
  on public.cogs_adjustments (occurred_at desc);

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

comment on table public.provider_cost_events is
  'Per-capability provider spend. One row per settled managed operation, keyed by source_ref so a settlement retry cannot double-count.';

comment on table public.cogs_adjustments is
  'Everything that moves managed-cloud margin without being provider spend: processing fees, refunds, chargebacks and their reserve, discounts, support goodwill and tax.';

comment on function public.cogs_summary(timestamptz, timestamptz) is
  'The single COGS aggregation. gross_margin_cents is billed spend less provider cost and every adjustment in the window.';

commit;
