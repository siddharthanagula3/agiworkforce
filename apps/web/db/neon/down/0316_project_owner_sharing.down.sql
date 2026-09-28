-- Reversal of 0316 : only members with sharing.manage write project shares.
--
-- WHAT THIS COSTS: a project owner without sharing.manage can no longer share
-- their project, change who may open it or stop sharing it; a manager has to.
-- Shares and grants an owner already made stay in place and keep working.

begin;

drop policy if exists organization_project_access_owner_delete on public.organization_project_access;
drop policy if exists organization_project_access_owner_update on public.organization_project_access;
drop policy if exists organization_project_access_owner_insert on public.organization_project_access;
drop policy if exists organization_shared_projects_owner_delete on public.organization_shared_projects;
drop policy if exists organization_shared_projects_owner_update on public.organization_shared_projects;
drop policy if exists organization_shared_projects_owner_insert on public.organization_shared_projects;

drop function if exists public.app_user_owns_live_project(uuid);

delete from public.schema_migrations
 where filename = '0316_project_owner_sharing.sql';

commit;
