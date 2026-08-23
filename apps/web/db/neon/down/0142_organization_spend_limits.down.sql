-- Reversal of 0142 — remove workspace spend caps.
--
-- WHAT THIS COSTS: any workspace enforcing a budget silently stops enforcing
-- it, and members can spend without limit again. No record of the cap survives.
-- Note which organizations had `enforcement = 'block'` before running this.
--
-- No usage record is changed and nothing is refunded.

begin;

drop policy if exists spend_limits_member_read on public.organization_spend_limits;
drop trigger if exists set_organization_spend_limits_updated_at
  on public.organization_spend_limits;
drop table if exists public.organization_spend_limits;
drop index if exists public.idx_managed_usage_requests_org_month;

delete from public.schema_migrations
 where filename = '0142_organization_spend_limits.sql';

commit;
