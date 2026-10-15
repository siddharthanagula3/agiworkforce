begin;

drop table if exists public.connector_tool_session_grants;
delete from public.schema_migrations
 where filename = '0364_connector_tool_session_grants.sql';

commit;
