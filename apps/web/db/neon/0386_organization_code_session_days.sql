-- =============================================================================
-- Migration 0386: per-day code sessions across a whole workspace
--
-- Why    : workspace usage analytics counted code sessions under the caller's
--          own row-level security, so a role holding billing.read without the
--          owner or admin role saw only its own sessions, not the workspace's.
--
-- Shape  : app_org_code_session_days returns, per UTC day in a window, how many
--          distinct code sessions had a settled request in the workspace. It
--          returns counts only and answers only a caller holding billing.read
--          in that workspace; anyone else gets no rows.
--
-- Depends: 0056_managed_usage_request_lifecycle, 0073_tenancy_foundation,
--          0200_organization_permission_grid (app_has_org_permission)
-- =============================================================================

begin;

create or replace function public.app_org_code_session_days(
  p_organization_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
returns table (day timestamptz, sessions integer)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select date_trunc('day', request_row.created_at at time zone 'UTC') at time zone 'UTC' as day,
         count(distinct request_row.usage->>'sessionId')::integer as sessions
    from public.managed_usage_requests request_row
   where public.app_has_org_permission(p_organization_id, 'billing.read')
     and request_row.organization_id = p_organization_id
     and request_row.status = 'completed'
     and request_row.usage->>'workload' = 'code'
     and request_row.usage->>'sessionId' is not null
     and request_row.created_at >= p_from
     and request_row.created_at < p_to
   group by 1
   order by 1;
$$;

revoke all on function public.app_org_code_session_days(uuid, timestamptz, timestamptz)
  from public;
grant execute on function public.app_org_code_session_days(uuid, timestamptz, timestamptz)
  to app_rls;

comment on function public.app_org_code_session_days(uuid, timestamptz, timestamptz) is
  'Per UTC day, distinct code sessions with a settled request in a workspace; counts only, for callers with billing.read in that workspace.';

commit;

-- =============================================================================
-- VERIFICATION -- run MANUALLY on a throwaway branch before production.
-- =============================================================================
-- -- 1. As a member without billing.read, the function returns no rows.
-- -- 2. As a billing reader who is not an admin, the counts include other
-- --    members' sessions.
-- =============================================================================
