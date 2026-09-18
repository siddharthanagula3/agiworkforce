-- Reversal of 0235, stop enforcing the shape of allowAutonomousToolApprovals.
--
-- Any key an administrator already stored stays stored, and the runtime
-- predicate still reads only the boolean true as permission, so dropping the
-- constraint widens what can be written, not what is honoured.

begin;

alter table public.organization_admin_policies
  drop constraint if exists organization_admin_policies_autonomous_approvals_boolean;

delete from public.schema_migrations
 where filename = '0235_autonomous_tool_approvals_workspace_switch.sql';

commit;
