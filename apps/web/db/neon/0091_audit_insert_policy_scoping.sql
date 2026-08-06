-- 0091_audit_insert_policy_scoping.sql
--
-- Defence-in-depth hardening of the INSERT policy added by
-- 0087_enterprise_audit_event_writes.sql.
--
-- WHAT 0087 GOT RIGHT: it revokes insert/update/delete on
-- enterprise_audit_events from app_rls, and Postgres checks table privileges
-- BEFORE it consults row-level policies. So app_rls cannot write an audit row
-- today, and this migration does not fix an exploitable hole.
--
-- WHAT IS BRITTLE: the accompanying policy is
--
--     create policy enterprise_audit_events_writer_insert
--       on public.enterprise_audit_events for insert
--       with check (true);
--
-- `with check (true)` and no `to <role>` clause means the policy applies to
-- PUBLIC and permits ANY row. The revoke is therefore the single control. An
-- audit trail whose integrity rests on one GRANT is one careless
-- `grant insert ... to app_rls` away from being forgeable — and a forged audit
-- row is worse than a missing one, because the whole point of the table is that
-- it can be trusted in a dispute.
--
-- This replaces the tautology with the actual invariant, so the policy stops
-- being a no-op and starts being a second, independent control:
--
--   * The service writer (the SECURITY DEFINER function running as the table
--     owner) has no app user bound — `current_app_user_id()` is null because
--     `SET LOCAL ROLE app_rls` and the request.jwt.claims GUCs are only set
--     inside withUser(). That path stays permitted, unchanged.
--
--   * Any session that DOES have an app user bound may only write a row scoped
--     to an organization it actually belongs to. If app_rls is ever granted
--     INSERT, it still cannot fabricate rows for another tenant.
--
-- Actor forgery within one's own org remains possible for a granted role; that
-- is bounded by the revoke, which stays in force. This narrows blast radius, it
-- does not replace the grant.

begin;

drop policy if exists enterprise_audit_events_writer_insert on public.enterprise_audit_events;

create policy enterprise_audit_events_writer_insert
  on public.enterprise_audit_events for insert
  with check (
    -- Service writer path: no app user bound to the session.
    public.current_app_user_id() is null
    -- Any app-user session may only write within its own organization.
    or public.app_has_org_role(
         organization_id,
         array['owner', 'admin', 'member', 'viewer']
       )
  );

comment on table public.enterprise_audit_events is
  'Append-only enterprise audit trail. INSERT is revoked from app_rls; the policy additionally confines any app-user session to its own organization so the grant is not the only control. Writes come from the SECURITY DEFINER writer, which runs without an app user bound.';

commit;
