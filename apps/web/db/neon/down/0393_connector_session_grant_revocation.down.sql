begin;

drop function public.revoke_connector_tool_session_grants(text, text);

delete from public.schema_migrations
where filename = '0393_connector_session_grant_revocation.sql';

commit;
