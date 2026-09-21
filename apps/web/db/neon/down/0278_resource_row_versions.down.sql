begin;

drop trigger if exists agent_tools_assign_version on public.agent_tools;
alter table public.agent_tools drop column if exists server_version;

drop trigger if exists scheduled_tasks_assign_version on public.scheduled_tasks;
alter table public.scheduled_tasks drop column if exists server_version;

drop trigger if exists organization_admin_policies_assign_version on public.organization_admin_policies;
alter table public.organization_admin_policies drop column if exists server_version;

drop trigger if exists project_knowledge_files_assign_version on public.project_knowledge_files;
alter table public.project_knowledge_files drop column if exists server_version;

delete from public.schema_migrations where filename = '0278_resource_row_versions.sql';

commit;
