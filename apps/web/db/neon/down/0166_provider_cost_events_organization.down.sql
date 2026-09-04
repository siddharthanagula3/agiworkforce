-- Reversal of 0166, drop the funding-organization column and its indexes.
--
-- Every cost event's organization_id attribution is lost. provider_cost_cents,
-- billed_cents and every other ledger fact survive; only which organization's
-- overage a settled event counted toward is forgotten, and
-- getOrganizationMonthToDateSpendCents reverts to returning zero for every
-- organization until 0166 is re-applied.

begin;

drop index if exists public.idx_organizations_owner_user_id;
drop index if exists public.idx_provider_cost_events_organization;

alter table public.provider_cost_events
  drop column if exists organization_id;

delete from public.schema_migrations
 where filename = '0166_provider_cost_events_organization.sql';

commit;
