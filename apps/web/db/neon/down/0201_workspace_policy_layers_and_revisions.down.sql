-- Reversal of 0201: forget policy layers and policy revisions.
--
-- WHAT THIS COSTS: every role, group and user policy exception is destroyed, so
-- every member falls back to the workspace defaults, and clients lose the
-- revision they poll to learn that policy changed. Export
-- organization_policy_overrides first if any exception is in use.

begin;

do $$
declare
  t text;
  revisioned text[] := array[
    'organization_admin_policies',
    'organization_model_policies',
    'organization_connector_policies',
    'organization_policy_overrides',
    'organization_roles',
    'organization_member_roles',
    'organization_group_roles'
  ];
begin
  foreach t in array revisioned loop
    if to_regclass(format('public.%I', t)) is not null then
      execute format('drop trigger if exists record_policy_revision on public.%I', t);
    end if;
  end loop;
end $$;

drop trigger if exists delete_member_policy_overrides on public.organization_members;
drop trigger if exists delete_group_policy_overrides on public.scim_groups;
drop trigger if exists delete_role_policy_overrides on public.organization_roles;

drop table if exists public.organization_policy_revisions;
drop table if exists public.organization_policy_overrides;

drop function if exists public.record_organization_policy_revision();
drop function if exists public.delete_policy_overrides_for_subject();

delete from public.schema_migrations
 where filename = '0201_workspace_policy_layers_and_revisions.sql';

commit;
