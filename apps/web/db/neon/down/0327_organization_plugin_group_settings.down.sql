-- Reversal of 0327 : workspaces no longer set their plugins per group.
--
-- WHAT THIS COSTS: every group override is deleted, so each member gets the
-- workspace-wide setting of every plugin again. The workspace plugins and
-- their workspace-wide settings are untouched.

begin;

drop function if exists public.organization_plugin_member_preferences(uuid, text);
drop trigger if exists organization_plugin_group_settings_assign_version
  on public.organization_plugin_group_settings;
drop trigger if exists set_organization_plugin_group_settings_updated_at
  on public.organization_plugin_group_settings;
drop index if exists public.organization_plugin_group_settings_org_idx;
drop table if exists public.organization_plugin_group_settings;

delete from public.schema_migrations
 where filename = '0327_organization_plugin_group_settings.sql';

commit;
