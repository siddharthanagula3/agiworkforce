-- Reversal of 0384 removes the per-day tool decision counts; workspace usage
-- analytics then fails to load until it is restored.

begin;

drop function if exists public.app_org_code_tool_decision_days(uuid, timestamptz, timestamptz);

delete from public.schema_migrations
 where filename = '0384_organization_code_tool_decision_days.sql';

commit;
