-- Reversal of 0205 : drop per-domain retention windows and their sweep record.
--
-- WHAT THIS COSTS: every domain other than workspace conversations is kept
-- indefinitely again, and the record of what earlier sweeps deleted is gone.
-- Nothing a sweep already deleted comes back.

begin;

drop policy if exists domain_retention_sweeps_audit_read
  on public.organization_domain_retention_sweeps;
drop policy if exists domain_retention_policies_audit_read
  on public.organization_domain_retention_policies;
drop trigger if exists set_domain_retention_policies_updated_at
  on public.organization_domain_retention_policies;
drop table if exists public.organization_domain_retention_sweeps;
drop table if exists public.organization_domain_retention_policies;

delete from public.schema_migrations
 where filename = '0205_domain_retention.sql';

commit;
