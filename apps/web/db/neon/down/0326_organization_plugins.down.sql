-- Reversal of 0326 : workspaces no longer publish plugins to their members.
--
-- WHAT THIS COSTS: every workspace plugin, its files and each member's own
-- settings for it are deleted, so members lose the skills those plugins gave
-- them. Plugins members installed from other sources are untouched.

begin;

drop policy if exists organization_plugin_members_owner on public.organization_plugin_members;
drop policy if exists organization_plugin_files_member_read on public.organization_plugin_files;
drop policy if exists organization_plugins_member_read on public.organization_plugins;
drop trigger if exists organization_plugin_members_assign_version on public.organization_plugin_members;
drop trigger if exists set_organization_plugin_members_updated_at on public.organization_plugin_members;
drop trigger if exists organization_plugin_files_assign_version on public.organization_plugin_files;
drop trigger if exists set_organization_plugin_files_updated_at on public.organization_plugin_files;
drop trigger if exists organization_plugins_assign_version on public.organization_plugins;
drop trigger if exists set_organization_plugins_updated_at on public.organization_plugins;
drop index if exists public.organization_plugin_members_user_idx;
drop index if exists public.organization_plugin_files_org_idx;
drop index if exists public.organization_plugins_published_idx;
drop table if exists public.organization_plugin_members;
drop table if exists public.organization_plugin_files;
drop table if exists public.organization_plugins;

delete from public.schema_migrations
 where filename = '0326_organization_plugins.sql';

commit;
