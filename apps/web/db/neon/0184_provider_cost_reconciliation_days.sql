-- 0184 : record what each provider says a day cost, next to what the ledger thinks.
--
-- NOT YET APPLIED : draft only, pending explicit approval before running.
--
-- provider_cost_events prices every call from the published rate at settle
-- time. 0183 gave that estimate its own column and left room for a figure the
-- provider itself reports, but nothing fetches one, so every row still stands
-- on reconciliation_status = 'estimated' and no one can say whether the
-- estimate is right. A wrong rate, a discount we forgot, a route billed under
-- a different tier: all of them are invisible while the only number in the
-- system is the one we computed ourselves.
--
-- This table is the provider's own answer, one row per provider per day per
-- source, so the daily cron can upsert yesterday's total without touching the
-- event ledger. It is deliberately NOT joined to provider_cost_events: an
-- invoice total covers traffic this deployment never recorded (another
-- environment, a console session, a batch job), so the comparison is a
-- reported-versus-ledger GAP, not a correction to be written back.
--
-- source names the endpoint the figure came from, because the same provider
-- can answer with different scopes: 'openai_costs_api' is org-wide, while
-- 'openrouter_key_usage' is one key's running total. Keeping source in the
-- primary key lets a second source arrive without overwriting the first.

begin;

create table if not exists public.provider_cost_reconciliation_days (
  provider text not null check (length(btrim(provider)) between 1 and 100),
  day date not null,
  reported_cost_microusd bigint not null check (reported_cost_microusd >= 0),
  source text not null check (length(btrim(source)) between 1 and 100),
  fetched_at timestamptz not null default now(),
  primary key (provider, day, source)
);

create index if not exists idx_provider_cost_reconciliation_days_day
  on public.provider_cost_reconciliation_days (day desc);

comment on table public.provider_cost_reconciliation_days is
  'What a provider itself reported for one UTC day, per reporting source. Written by /api/cron/reconcile-provider-costs. Compared against the sum of provider_cost_events for the same provider and day; a difference is a gap to investigate, never an automatic correction.';

comment on column public.provider_cost_reconciliation_days.reported_cost_microusd is
  'The provider figure in microUSD. Providers answer in dollars (OpenAI), in cents as a decimal string (Anthropic) or in their own credit unit (OpenRouter); each client converts before writing so this column has one unit.';

comment on column public.provider_cost_reconciliation_days.source is
  'The endpoint the figure came from, so two scopes for one provider can coexist. A running-total source (openrouter_key_usage) is cumulative, not a daily amount.';

commit;

-- =============================================================================
-- VERIFICATION : run MANUALLY on a throwaway Neon BRANCH before production.
-- (Commented so it never runs during apply.)
-- =============================================================================
-- -- 1. The table exists with the composite key:
-- --    SELECT a.attname FROM pg_index i
-- --      JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
-- --     WHERE i.indrelid = 'public.provider_cost_reconciliation_days'::regclass
-- --       AND i.indisprimary;
-- --                                     -- EXPECT: provider, day, source
--
-- -- 2. A second source for the same provider and day does not collide:
-- --    INSERT INTO public.provider_cost_reconciliation_days
-- --      VALUES ('openai', current_date, 100, 'openai_costs_api'),
-- --             ('openai', current_date, 110, 'invoice_pdf');
-- --                                          -- EXPECT: 2 rows inserted
--
-- -- 3. Re-running the cron for the same day updates rather than duplicates:
-- --    INSERT INTO public.provider_cost_reconciliation_days
-- --      VALUES ('openai', current_date, 120, 'openai_costs_api')
-- --      ON CONFLICT (provider, day, source)
-- --      DO UPDATE SET reported_cost_microusd = excluded.reported_cost_microusd;
-- --    SELECT reported_cost_microusd FROM public.provider_cost_reconciliation_days
-- --     WHERE provider = 'openai' AND source = 'openai_costs_api';
-- --                                                        -- EXPECT: 120
-- =============================================================================
