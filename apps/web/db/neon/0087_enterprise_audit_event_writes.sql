-- =============================================================================
-- Migration: 0087_enterprise_audit_event_writes.sql
-- Purpose  : AUDIT-TRAIL-01 — make public.enterprise_audit_events WRITABLE.
--
-- Problem being fixed (verified against 0076_enterprise_control_plane_tables.sql):
--   0076 creates the table, grants app_rls select/insert/update/delete, then does
--     alter table public.enterprise_audit_events enable  row level security;
--     alter table public.enterprise_audit_events force   row level security;
--   and creates exactly ONE policy — `enterprise_audit_events_admin_read`
--   (FOR SELECT). With RLS enabled and no INSERT policy, EVERY insert is
--   rejected, for every role, including the table owner (FORCE applies to the
--   owner too). The Enterprise "audit trail" therefore had a read endpoint
--   (services/api-gateway/src/routes/enterprise.ts) over a table nothing could
--   ever write to.
--
-- Shape of the fix (append-only, non-forgeable):
--   1. A SECURITY DEFINER writer function owned by the table owner. All audit
--      writes go through it, so a caller cannot choose an arbitrary column set,
--      and outcome/severity are validated server-side rather than trusted.
--   2. app_rls loses INSERT/UPDATE/DELETE on the table entirely. Because the
--      GRANT check runs BEFORE row-level policies, app_rls can never write a
--      row directly — not even one that would satisfy a permissive policy.
--      This mirrors the append-only posture 0043 established for
--      public.security_audit_logs.
--   3. A permissive INSERT policy exists so the SECURITY DEFINER function (which
--      runs as the table owner, and IS subject to policies because of FORCE RLS)
--      can complete its insert. It is intentionally `with check (true)` and
--      unscoped by role: the real gate is the revoked INSERT privilege in (2).
--   SELECT stays gated by the existing `enterprise_audit_events_admin_read`
--   policy; this migration does not touch reads.
--
-- !! NO BLANKET GRANTS. Per the 0043 re-grant footgun, never re-issue
-- !! `grant ... on all tables in schema public to app_rls` — it would restore
-- !! direct INSERT/UPDATE/DELETE here and on security_audit_logs and silently
-- !! undo both append-only guarantees with no failing test.
--
-- Severity vocabularies differ by design and are NOT unified here:
--   enterprise_audit_events.severity  ∈ {info, warning, critical}
--   security_audit_logs.severity      ∈ {info, warning, error, critical, low, medium, high}
-- The writer below rejects anything outside its own three-value set rather than
-- silently coercing, so a bad caller is visible instead of mislabelled.
-- =============================================================================

create or replace function public.record_enterprise_audit_event(
  p_organization_id uuid,
  p_actor_user_id text,
  p_surface text,
  p_action text,
  p_resource_type text,
  p_resource_id text,
  p_outcome text,
  p_severity text,
  p_metadata jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_id uuid;
begin
  if p_organization_id is null then
    raise exception 'record_enterprise_audit_event: organization_id is required'
      using errcode = '22023';
  end if;

  if coalesce(p_action, '') = '' then
    raise exception 'record_enterprise_audit_event: action is required'
      using errcode = '22023';
  end if;

  -- Validate against the table's own CHECK vocabularies here so a bad value
  -- fails with an actionable message instead of a constraint violation, and so
  -- a caller can never widen the vocabulary by accident.
  if p_outcome is null or p_outcome not in ('success', 'failure', 'denied') then
    raise exception 'record_enterprise_audit_event: outcome must be success|failure|denied, got %',
      coalesce(p_outcome, 'null') using errcode = '22023';
  end if;

  if p_severity is null or p_severity not in ('info', 'warning', 'critical') then
    raise exception 'record_enterprise_audit_event: severity must be info|warning|critical, got %',
      coalesce(p_severity, 'null') using errcode = '22023';
  end if;

  insert into public.enterprise_audit_events (
    organization_id,
    actor_user_id,
    surface,
    action,
    resource_type,
    resource_id,
    outcome,
    severity,
    metadata
  ) values (
    p_organization_id,
    p_actor_user_id,
    coalesce(nullif(p_surface, ''), 'web'),
    p_action,
    coalesce(nullif(p_resource_type, ''), 'unknown'),
    p_resource_id,
    p_outcome,
    p_severity,
    case
      when p_metadata is null then '{}'::jsonb
      when jsonb_typeof(p_metadata) = 'object' then p_metadata
      else '{}'::jsonb
    end
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- The writer must not be callable by every login role that happens to exist.
revoke execute on function public.record_enterprise_audit_event(
  uuid, text, text, text, text, text, text, text, jsonb
) from public;

grant execute on function public.record_enterprise_audit_event(
  uuid, text, text, text, text, text, text, text, jsonb
) to app_rls;

-- Append-only for the application role: reads stay policy-gated, writes are only
-- possible through the SECURITY DEFINER writer above.
revoke insert, update, delete on public.enterprise_audit_events from app_rls;

-- Allows the SECURITY DEFINER writer (running as the table owner, still subject
-- to policies because the table is FORCE RLS) to complete its insert. Roles
-- without the INSERT privilege — app_rls after the revoke above — are stopped by
-- the grant check before this policy is ever consulted.
drop policy if exists enterprise_audit_events_writer_insert on public.enterprise_audit_events;
create policy enterprise_audit_events_writer_insert
  on public.enterprise_audit_events for insert
  with check (true);

-- =============================================================================
-- VERIFICATION — run MANUALLY on a throwaway Neon BRANCH before applying to
-- production. Vitest cannot prove any of this: every DB test in apps/web mocks
-- the adapter, so a green suite says nothing about role/RLS behaviour here.
-- (Commented so it never runs during apply.)
-- =============================================================================
-- -- 1. The writer succeeds as the owner (this is the production path):
-- --    select public.record_enterprise_audit_event(
-- --      '<real-org-uuid>'::uuid, 'user_test', 'web', 'member_role_changed',
-- --      'organization_member', 'user_target', 'success', 'info', '{"role":"admin"}'::jsonb);
-- --    EXPECT: returns a uuid, and the row is visible in enterprise_audit_events.
--
-- -- 2. app_rls can EXECUTE the writer:
-- --    set role app_rls;
-- --    select public.record_enterprise_audit_event(
-- --      '<real-org-uuid>'::uuid, 'user_test', 'gateway', 'member_invited',
-- --      'organization_member', 'user_target', 'success', 'info', '{}'::jsonb);
-- --    EXPECT: returns a uuid.
--
-- -- 3. app_rls CANNOT insert directly (forgery is blocked):
-- --    set role app_rls;
-- --    insert into public.enterprise_audit_events
-- --      (organization_id, actor_user_id, surface, action, resource_type, outcome, severity)
-- --      values ('<real-org-uuid>'::uuid, 'someone_else', 'web', 'forged',
-- --              'organization_member', 'success', 'info');
-- --    EXPECT: ERROR permission denied for table enterprise_audit_events.
--
-- -- 4. app_rls still cannot tamper with history:
-- --    set role app_rls;
-- --    update public.enterprise_audit_events set outcome = 'denied';  -- EXPECT: permission denied
-- --    delete from public.enterprise_audit_events;                     -- EXPECT: permission denied
--
-- -- 5. Reads are unchanged (org-admin only, via the 0076 policy):
-- --    set role app_rls;
-- --    set local request.jwt.claims = '{"sub":"<non-admin-user>"}';
-- --    select count(*) from public.enterprise_audit_events;  -- EXPECT: 0
--
-- -- 6. Bad vocabularies are rejected, not coerced:
-- --    select public.record_enterprise_audit_event(
-- --      '<real-org-uuid>'::uuid, null, 'web', 'x', 'y', null, 'maybe', 'info', '{}'::jsonb);
-- --    EXPECT: ERROR ... outcome must be success|failure|denied
-- =============================================================================
