-- Reversal of 0340: forget workspace rules for individual connector tools.
--
-- WHAT THIS COSTS: every saved workspace tool rule is destroyed, and members'
-- connector tools fall back to their own verdicts. Export the column first if
-- any workspace has set rules.

begin;

alter table public.organization_connector_policies
  drop constraint if exists tool_rules_bounded;

alter table public.organization_connector_policies
  drop column if exists tool_rules;

delete from public.schema_migrations
 where filename = '0340_workspace_connector_tool_rules.sql';

commit;
