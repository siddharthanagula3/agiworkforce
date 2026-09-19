-- =============================================================================
-- Migration 0267: three admin read policies ask for a permission, not a role
--
-- Why    : 0200 replaced role-name tests with `app_has_org_permission` so a
--          custom role, an additional role or a group-granted role is honoured.
--          Three policies authored after it still test
--          `app_has_org_role(organization_id, array['owner','admin'])`, so a
--          member who holds the permission through a custom or SCIM-group role
--          is refused, and an owner who had the permission revoked is allowed.
--
-- What   : drops and re-creates those three policies against the grid's
--          permission keys. Nothing else about the tables changes.
--
--          0227 organization_subscription_state_transitions -> billing.read,
--               the key 0200 uses for organization_billing_contracts and
--               organization_billing_invoices reads.
--          0228 organization_commercial_agreements -> billing.contracts.manage,
--               the grid's key for contract administration.
--          0248 scim_group_members -> directory.manage, the key 0200 already
--               uses for scim_groups and the rest of the directory tables.
--
-- Depends: 0200 (app_has_org_permission), 0227, 0228, 0248.
--
-- NOT YET APPLIED, draft only, pending explicit approval.
-- =============================================================================

begin;

drop policy if exists organization_subscription_state_transitions_admin_read
  on public.organization_subscription_state_transitions;
create policy organization_subscription_state_transitions_admin_read
  on public.organization_subscription_state_transitions for select
  using (public.app_has_org_permission(organization_id, 'billing.read'));

drop policy if exists organization_commercial_agreements_admin_read
  on public.organization_commercial_agreements;
create policy organization_commercial_agreements_admin_read
  on public.organization_commercial_agreements for select
  using (public.app_has_org_permission(organization_id, 'billing.contracts.manage'));

drop policy if exists scim_group_members_admin_read on public.scim_group_members;
create policy scim_group_members_admin_read
  on public.scim_group_members for select to app_rls
  using (public.app_has_org_permission(organization_id, 'directory.manage'));

commit;
