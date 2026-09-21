-- Depends: 0006, 0038, 0073
-- A resource two people can edit needs a version to compare against, or the
-- second writer silently replaces the first. These four carry none, so every
-- update is a blind overwrite.
begin;

alter table public.project_knowledge_files
  add column if not exists server_version bigint not null default 0;

update public.project_knowledge_files
   set server_version = nextval('public.cloud_sync_version_seq')
 where server_version = 0;

drop trigger if exists project_knowledge_files_assign_version on public.project_knowledge_files;
create trigger project_knowledge_files_assign_version
  before insert or update on public.project_knowledge_files
  for each row execute function public.assign_cloud_sync_version();

alter table public.organization_admin_policies
  add column if not exists server_version bigint not null default 0;

update public.organization_admin_policies
   set server_version = nextval('public.cloud_sync_version_seq')
 where server_version = 0;

drop trigger if exists organization_admin_policies_assign_version on public.organization_admin_policies;
create trigger organization_admin_policies_assign_version
  before insert or update on public.organization_admin_policies
  for each row execute function public.assign_cloud_sync_version();

alter table public.scheduled_tasks
  add column if not exists server_version bigint not null default 0;

update public.scheduled_tasks
   set server_version = nextval('public.cloud_sync_version_seq')
 where server_version = 0;

drop trigger if exists scheduled_tasks_assign_version on public.scheduled_tasks;
create trigger scheduled_tasks_assign_version
  before insert or update on public.scheduled_tasks
  for each row execute function public.assign_cloud_sync_version();

alter table public.agent_tools
  add column if not exists server_version bigint not null default 0;

update public.agent_tools
   set server_version = nextval('public.cloud_sync_version_seq')
 where server_version = 0;

drop trigger if exists agent_tools_assign_version on public.agent_tools;
create trigger agent_tools_assign_version
  before insert or update on public.agent_tools
  for each row execute function public.assign_cloud_sync_version();

commit;
