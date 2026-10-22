-- =============================================================================
-- Migration 0384: per-day tool decisions for a workspace's code sessions
--
-- Why    : workspace usage analytics reports per-day code sessions and the
--          share of tool approvals people accepted. Approval decisions live in
--          cloud_code_agent_approvals, which app_rls cannot read, so an
--          administrator had no way to see them.
--
-- Shape  : app_org_code_tool_decision_days returns, per UTC day in a window,
--          how many approvals in the workspace's code turns were approved and
--          how many were rejected. It returns counts only, never a command or a
--          goal, and only to a caller holding billing.read in that workspace;
--          anyone else gets no rows.
--
-- Depends: 0082_cloud_code_agent_turns, 0200_organization_permission_grid
--          (app_has_org_permission)
-- =============================================================================

begin;

create or replace function public.app_org_code_tool_decision_days(
  p_organization_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
returns table (day timestamptz, accepted integer, rejected integer)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select date_trunc('day', approval.decided_at at time zone 'UTC') at time zone 'UTC' as day,
         count(*) filter (where approval.state = 'approved')::integer as accepted,
         count(*) filter (where approval.state = 'rejected')::integer as rejected
    from public.cloud_code_agent_approvals approval
    join public.cloud_code_agent_turns turn on turn.id = approval.turn_id
   where public.app_has_org_permission(p_organization_id, 'billing.read')
     and turn.organization_id = p_organization_id
     and approval.state in ('approved', 'rejected')
     and approval.decided_at >= p_from
     and approval.decided_at < p_to
   group by 1
   order by 1;
$$;

revoke all on function public.app_org_code_tool_decision_days(uuid, timestamptz, timestamptz)
  from public;
grant execute on function public.app_org_code_tool_decision_days(uuid, timestamptz, timestamptz)
  to app_rls;

comment on function public.app_org_code_tool_decision_days(uuid, timestamptz, timestamptz) is
  'Per UTC day, approved and rejected tool approvals in a workspace''s code turns; counts only, for callers with billing.read in that workspace.';

commit;

-- =============================================================================
-- VERIFICATION -- run MANUALLY on a throwaway branch before production.
-- =============================================================================
-- -- 1. As a member without billing.read, the function returns no rows.
-- -- 2. As an administrator, the sums match:
-- --    select sum(accepted) + sum(rejected)
-- --      from public.app_org_code_tool_decision_days('<org>', now() - interval '30 days', now());
-- =============================================================================
