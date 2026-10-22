-- Reversal of 0386 removes the workspace code session counts; workspace usage
-- analytics then reports its activity section as unavailable until restored.

begin;

drop function if exists public.app_org_code_session_days(uuid, timestamptz, timestamptz);

delete from public.schema_migrations where filename = '0386_organization_code_session_days.sql';

commit;
