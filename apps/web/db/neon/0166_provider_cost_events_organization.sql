-- 0166 — give each provider cost event the organization that funds it.
--
-- NOT YET APPLIED, draft only, pending explicit approval before running.
--
-- getOrganizationMonthToDateSpendCents joined provider_cost_events (keyed
-- only by user_id) to organization_members on user_id: a user who belongs to
-- two organizations had their whole spend counted toward both organizations'
-- overage independently, and that number now drives real Stripe billing
-- meter events from the report-enterprise-usage cron. Per decision D22, a
-- cost event instead carries the single organization whose plan funds the
-- usage, resolved the same way entitlement is resolved
-- (resolveEnterpriseFundingOrganizationId: the org the user owns, else an
-- org they hold a seat in), so each event is metered at most once. Nullable:
-- a personal-scope event has no funding organization, and every row written
-- before this column existed stays null rather than being backfilled from a
-- guess.
--
-- idx_provider_cost_events_organization supports the month-to-date spend
-- query, which filters by organization_id and the caller-supplied period's
-- occurred_at bounds, the same event-time column the table's existing
-- occurred_at indexes already key off (not created_at, the row's own insert
-- time). idx_organizations_owner_user_id supports the funding-organization
-- lookup's `organizations.owner_user_id = $1` branch, run on every settled
-- managed-usage request.

begin;

alter table public.provider_cost_events
  add column if not exists organization_id uuid references public.organizations(id) on delete set null;

create index if not exists idx_provider_cost_events_organization
  on public.provider_cost_events (organization_id, occurred_at);

create index if not exists idx_organizations_owner_user_id
  on public.organizations (owner_user_id);

comment on column public.provider_cost_events.organization_id is
  'The organization whose plan funds this usage, resolved the same way entitlement is (resolveEnterpriseFundingOrganizationId). Null for personal-scope usage and for rows written before this column existed.';

commit;

-- =============================================================================
-- VERIFICATION — run MANUALLY on a throwaway Neon BRANCH before production.
-- (Commented so it never runs during apply.)
-- =============================================================================
-- -- 1. No existing row is retroactively attributed to an organization:
-- --    SELECT count(*) FROM public.provider_cost_events WHERE organization_id IS NOT NULL;
-- --                                                              -- EXPECT: 0
--
-- -- 2. A user in two organizations never sums into both:
-- --    SELECT organization_id, sum(provider_cost_cents) FROM public.provider_cost_events
-- --     WHERE user_id = '<user with two org memberships>' GROUP BY organization_id;
-- --                                                -- EXPECT: at most one non-null group
-- =============================================================================
