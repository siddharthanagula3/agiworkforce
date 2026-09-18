-- 0235 : the workspace switch that decides whether a member may skip approvals.
--
-- NOT YET APPLIED : draft only, pending explicit approval before running.
--
-- The third tool-approval policy, `autonomous`, is the only one a member cannot
-- grant themselves: it runs every non-destructive tool call without waiting for
-- a human, so the workspace has to be able to say no. The answer lives on
-- `organization_admin_policies.metadata` under `allowAutonomousToolApprovals`
-- (AUTONOMOUS_TOOL_APPROVALS_ORGANIZATION_KEY in packages/contracts/types),
-- because it is a per-workspace boolean and metadata is already the column the
-- admin policy writes such flags through.
--
-- metadata is free-form jsonb, so the key could be written as the string
-- "false" and read back as a value that is not the boolean false. The runtime
-- predicate already treats any non-`true` value as a refusal, and this
-- constraint keeps the stored shape honest as well, so an admin surface cannot
-- persist a value that reads one way in SQL and another in the gate. Absent
-- stays permitted: an unconfigured workspace is ungoverned, not restricted.
--
-- Empty  : no row sets the key until an administrator turns the switch off, so
--          applying this changes no decision.
--
-- Depends: 0076 (organization_admin_policies.metadata)

begin;

alter table public.organization_admin_policies
  drop constraint if exists organization_admin_policies_autonomous_approvals_boolean;

alter table public.organization_admin_policies
  add constraint organization_admin_policies_autonomous_approvals_boolean
  check (
    not (metadata ? 'allowAutonomousToolApprovals')
    or jsonb_typeof(metadata -> 'allowAutonomousToolApprovals') = 'boolean'
  );

comment on constraint organization_admin_policies_autonomous_approvals_boolean
  on public.organization_admin_policies is
  'allowAutonomousToolApprovals is a boolean or absent. Absent permits the autonomous tool-approval policy; false forbids it for every member of the workspace.';

commit;
