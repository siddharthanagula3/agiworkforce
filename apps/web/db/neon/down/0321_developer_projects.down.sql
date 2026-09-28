-- Reversal of 0319 : API keys are no longer grouped into developer projects.
--
-- WHAT THIS COSTS: every developer project and its monthly credit limit is
-- deleted, keys lose the project they were in, and managed usage no longer
-- records which key made it. The keys themselves keep working, including keys
-- that archiving a project revoked, which stay revoked.

begin;

drop index if exists public.idx_managed_usage_requests_api_key_created;
alter table public.managed_usage_requests drop column if exists api_key_id;

drop index if exists public.idx_api_keys_project;
alter table public.api_keys drop column if exists project_id;

drop policy if exists developer_projects_owner on public.developer_projects;
drop trigger if exists set_developer_projects_updated_at on public.developer_projects;
drop index if exists public.idx_developer_projects_live_name;
drop index if exists public.idx_developer_projects_user;
drop table if exists public.developer_projects;

delete from public.schema_migrations
 where filename = '0319_developer_projects.sql';

commit;
