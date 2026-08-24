-- Reversal of 0141 — remove workspace connector governance.
--
-- WHAT THIS COSTS: every saved restriction is destroyed, and a workspace that
-- had blocked a connector for a compliance reason silently regains it with no
-- record that the block existed. Export the table first if any row exists.
--
-- No connector, credential, or member is affected. Only the restrictions stop
-- being applied.

begin;

drop policy if exists connector_policy_member_read on public.organization_connector_policies;
drop trigger if exists set_organization_connector_policies_updated_at
  on public.organization_connector_policies;
drop table if exists public.organization_connector_policies;

delete from public.schema_migrations
 where filename = '0141_organization_connector_policy.sql';

commit;
