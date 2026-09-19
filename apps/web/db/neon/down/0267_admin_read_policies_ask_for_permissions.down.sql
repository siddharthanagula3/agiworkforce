-- Reversal of 0267 : restores the role-array form of the three admin read
-- policies from 0227, 0228 and 0248.
--
-- WHAT THIS COSTS: a member who reads subscription history, commercial
-- agreements or SCIM group membership through a custom, additional or
-- group-granted role loses that access again, and an owner or admin whose
-- permission was revoked regains it.

begin;

drop policy if exists organization_subscription_state_transitions_admin_read
  on public.organization_subscription_state_transitions;
create policy organization_subscription_state_transitions_admin_read
  on public.organization_subscription_state_transitions for select
  using (public.app_has_org_role(organization_id, array['owner', 'admin']::text[]));

drop policy if exists organization_commercial_agreements_admin_read
  on public.organization_commercial_agreements;
create policy organization_commercial_agreements_admin_read
  on public.organization_commercial_agreements for select
  using (public.app_has_org_role(organization_id, array['owner', 'admin']::text[]));

drop policy if exists scim_group_members_admin_read on public.scim_group_members;
create policy scim_group_members_admin_read
  on public.scim_group_members for select to app_rls
  using (public.app_has_org_role(organization_id, array['owner', 'admin']::text[]));

delete from public.schema_migrations
 where filename = '0267_admin_read_policies_ask_for_permissions.sql';

commit;
