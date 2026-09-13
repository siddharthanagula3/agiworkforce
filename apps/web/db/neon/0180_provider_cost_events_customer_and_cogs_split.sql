-- 0180 : make every column on the COGS ledger mean what its name says.
--
-- NOT YET APPLIED : draft only, pending explicit approval before running.
--
-- provider_cost_events has carried two different numbers under one name since
-- 0127. recordSettledProviderCost writes `billed_cents := actualCostCents`,
-- and actualCostCents is what the PROVIDER charged us, not what the customer
-- was charged. The customer's list charge has only ever existed as
-- metadata->>'retailCostCents', a jsonb key with no type, no index and no
-- constraint. Any margin question answered as billed_cents - provider_cost_
-- cents therefore reads zero margin on every settled chat row, because both
-- sides of that subtraction are the same number.
--
-- This migration gives the customer side its own typed column, keeps the
-- provider side in two explicit halves (what we estimated at settle time and
-- what the provider later reported), and records which of those a row is
-- currently standing on. Every column is nullable: rows written before it
-- existed keep their history rather than being invented.
--
-- customer_credits is the same money in the unit a user sees. One credit is a
-- fiftieth of a dollar (TOP_UP_UNITS_PER_USD = 50), so 20,000 microUSD is one
-- credit; numeric(18,4) so a sub-credit charge is not rounded into nothing.
--
-- feature, route_id, surface and the four token counts are the dimensions a
-- margin question is actually sliced by. They lived only inside metadata, so
-- every such query was a jsonb scan over the whole table.
--
-- billed_cents itself is NOT rewritten. It is an applied column with real
-- history; the comment states what it holds so no future reader repeats the
-- mistake, and readers move to customer_canonical_microusd.

begin;

alter table public.provider_cost_events
  add column if not exists customer_canonical_microusd bigint
    check (customer_canonical_microusd is null or customer_canonical_microusd >= 0),
  add column if not exists customer_credits numeric(18, 4)
    check (customer_credits is null or customer_credits >= 0),
  add column if not exists provider_estimated_cost_microusd bigint
    check (provider_estimated_cost_microusd is null or provider_estimated_cost_microusd >= 0),
  add column if not exists provider_reported_cost_microusd bigint
    check (provider_reported_cost_microusd is null or provider_reported_cost_microusd >= 0),
  add column if not exists reconciliation_status text not null default 'estimated'
    check (reconciliation_status = any (array['estimated', 'provider_reported', 'reconciled'])),
  add column if not exists feature text
    check (feature is null or length(btrim(feature)) between 1 and 100),
  add column if not exists route_id text
    check (route_id is null or length(btrim(route_id)) between 1 and 200),
  add column if not exists surface text
    check (surface is null or length(btrim(surface)) between 1 and 40),
  add column if not exists input_tokens integer check (input_tokens is null or input_tokens >= 0),
  add column if not exists cached_tokens integer check (cached_tokens is null or cached_tokens >= 0),
  add column if not exists output_tokens integer check (output_tokens is null or output_tokens >= 0),
  add column if not exists reasoning_tokens integer
    check (reasoning_tokens is null or reasoning_tokens >= 0);

-- The only customer figure the ledger has ever held is metadata.retailCostCents,
-- written by resolveRetailCostCents on token-priced rows. The regexp guard is
-- load-bearing: the key is untyped jsonb, and a single malformed value would
-- abort the whole backfill on a cast error.
update public.provider_cost_events
   set customer_canonical_microusd = (metadata ->> 'retailCostCents')::bigint * 10000,
       customer_credits = ((metadata ->> 'retailCostCents')::numeric * 10000) / 20000
 where customer_canonical_microusd is null
   and metadata ? 'retailCostCents'
   and metadata ->> 'retailCostCents' ~ '^[0-9]+$';

create index if not exists idx_provider_cost_events_user_feature_occurred
  on public.provider_cost_events (user_id, feature, occurred_at desc)
  where user_id is not null and feature is not null;

comment on column public.provider_cost_events.billed_cents is
  'HISTORICAL SHAPE. Holds the PROVIDER cost, not the customer charge: recordSettledProviderCost has always written actual_cost_cents here. Never read it as what the customer paid; read customer_canonical_microusd.';

comment on column public.provider_cost_events.customer_canonical_microusd is
  'What the customer is charged for this event, in microUSD, at the canonical list price. Null on rows written before this column existed and on rows that carry no customer charge (an included search, a provider cost with no retail counterpart).';

comment on column public.provider_cost_events.customer_credits is
  'customer_canonical_microusd expressed in the credits a user sees. One credit is a fiftieth of a dollar, so 20,000 microUSD.';

comment on column public.provider_cost_events.provider_estimated_cost_microusd is
  'What we priced this event at when it settled, from the published provider rate. Present even after a provider report arrives, so the estimate can be scored against reality.';

comment on column public.provider_cost_events.provider_reported_cost_microusd is
  'What the provider itself later said this event cost. Null until a provider report is ingested.';

comment on column public.provider_cost_events.reconciliation_status is
  'estimated: priced from the published rate only. provider_reported: a provider figure has arrived. reconciled: the two have been compared and the row is settled against the provider invoice.';

comment on column public.provider_cost_events.feature is
  'The rate-card feature this event was priced under (FEATURE_RATE_CARD key), where one applies. Null for capabilities priced from the model catalogue rather than the rate card.';

comment on column public.provider_cost_events.surface is
  'The client surface the request came from (CloudChatSurface), so interactive and automated traffic can be told apart without a jsonb scan.';

commit;

-- =============================================================================
-- VERIFICATION : run MANUALLY on a throwaway Neon BRANCH before production.
-- (Commented so it never runs during apply.)
-- =============================================================================
-- -- 1. The backfill covers every row that had a retail figure, and no others:
-- --    SELECT count(*) FILTER (WHERE metadata ? 'retailCostCents')                AS had_retail,
-- --           count(*) FILTER (WHERE customer_canonical_microusd IS NOT NULL)     AS backfilled
-- --      FROM public.provider_cost_events;
-- --                                        -- EXPECT: backfilled = had_retail
--
-- -- 2. Credits and microUSD agree on every backfilled row:
-- --    SELECT count(*) FROM public.provider_cost_events
-- --     WHERE customer_canonical_microusd IS NOT NULL
-- --       AND customer_credits <> customer_canonical_microusd / 20000.0;
-- --                                                              -- EXPECT: 0
--
-- -- 3. No row lost its provider cost:
-- --    SELECT count(*) FROM public.provider_cost_events WHERE provider_cost_cents IS NULL;
-- --                                                              -- EXPECT: 0
--
-- -- 4. Every pre-existing row reads as an estimate:
-- --    SELECT DISTINCT reconciliation_status FROM public.provider_cost_events;
-- --                                                    -- EXPECT: {estimated}
-- =============================================================================
