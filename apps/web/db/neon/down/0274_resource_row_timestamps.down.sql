-- Drops the row timestamps 0274 added; the rewrite history they carried is lost.
begin;

drop trigger if exists organization_members_touch_updated_at on public.organization_members;
drop function if exists public.touch_organization_member_updated_at();

alter table public.organization_members drop column if exists updated_at;
alter table public.mcp_response_cache drop column if exists created_at;
alter table public.connector_tool_permissions drop column if exists created_at;

delete from public.schema_migrations where filename = '0274_resource_row_timestamps.sql';
commit;
