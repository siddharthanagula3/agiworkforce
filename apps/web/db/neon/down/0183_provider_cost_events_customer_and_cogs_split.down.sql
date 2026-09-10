-- Reversal of 0183 : take the customer and provider split back off the COGS ledger.
--
-- WHAT THIS COSTS: every customer charge recorded since 0183 applied is lost.
-- The backfilled rows can be reconstructed from metadata->>'retailCostCents',
-- but any row written AFTER 0183 whose customer charge came from a caller
-- rather than from that metadata key has no other copy. Reconciliation status
-- and provider-reported figures are lost outright. Per-feature, per-surface
-- and per-token-class slicing goes back to a jsonb scan.
--
-- No provider cost is lost: provider_cost_cents and billed_cents are untouched.

begin;

drop index if exists idx_provider_cost_events_user_feature_occurred;

alter table public.provider_cost_events
  drop column if exists customer_canonical_microusd,
  drop column if exists customer_credits,
  drop column if exists provider_estimated_cost_microusd,
  drop column if exists provider_reported_cost_microusd,
  drop column if exists reconciliation_status,
  drop column if exists feature,
  drop column if exists route_id,
  drop column if exists surface,
  drop column if exists input_tokens,
  drop column if exists cached_tokens,
  drop column if exists output_tokens,
  drop column if exists reasoning_tokens;

comment on column public.provider_cost_events.billed_cents is null;

delete from public.schema_migrations
  where filename = '0183_provider_cost_events_customer_and_cogs_split.sql';

commit;
