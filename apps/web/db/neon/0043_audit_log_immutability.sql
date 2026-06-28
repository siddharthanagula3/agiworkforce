-- =============================================================================
-- Migration: 0043_audit_log_immutability.sql
-- Purpose  : AUDIT-IMMUT-01 — make public.security_audit_logs tamper-evident
--            (append-only) for the application role. The audit trail is an
--            integrity control; app_rls must be able to WRITE (INSERT) and READ
--            (SELECT) audit events but MUST NOT alter (UPDATE) or erase (DELETE)
--            them. The two legitimate deleters — 90-day retention
--            (cleanup_old_security_logs) and GDPR erasure (delete_user_data) —
--            are converted to SECURITY DEFINER so they keep working (running as
--            the table owner) after the REVOKE.
--
-- Evidence (verified 2026-06-25 against current source):
--   * Only these two functions DELETE the table (0020_functions.sql:1200, 1385);
--     application code only INSERTs (apps/web/lib/security-audit.ts,
--     apps/web/lib/services/security-monitoring-service.ts). Nothing UPDATEs it.
--   * app_rls holds UPDATE/DELETE via the blanket grant at
--     0037_rls_user_isolation.sql:81 (GRANT ... ON ALL TABLES ... TO app_rls).
--   * app_rls has USAGE (not CREATE) on schema public, so keeping `public` in a
--     SECURITY DEFINER search_path is not an injection surface for app_rls.
--
-- !! RE-GRANT FOOTGUN: this REVOKE fixes today's state, but any FUTURE
-- !! `GRANT ... ON ALL TABLES IN SCHEMA public TO app_rls` (cf. 0037:81) will
-- !! silently re-grant UPDATE/DELETE here and undo immutability with NO failing
-- !! test. Never re-issue a blanket UPDATE/DELETE grant on this table to app_rls.
-- !! The durable, re-grant-proof mechanism is a BEFORE UPDATE OR DELETE trigger
-- !! that RAISEs for non-owner roles; it is deferred (it must coexist with the
-- !! SECURITY DEFINER purges) and tracked as the AUDIT-IMMUT-01 follow-up.
-- =============================================================================

-- 1. Append-only for the application role: keep INSERT + SELECT, remove the
--    ability to tamper with or erase audit history.
revoke update, delete on public.security_audit_logs from app_rls;

-- 2. Retention purge must still work after the REVOKE: run it as the table owner
--    (SECURITY DEFINER), with a hardened search_path (pg_catalog first so
--    built-ins cannot be shadowed; public is safe — app_rls cannot CREATE in it;
--    pg_temp last so temp objects cannot shadow).
alter function public.cleanup_old_security_logs() security definer;
alter function public.cleanup_old_security_logs()
  set search_path = pg_catalog, public, pg_temp;

-- 3. GDPR erasure must also still purge the audit rows for the erased user.
--    p_user_id is already parameterized (injection-safe).
alter function public.delete_user_data(text) security definer;
alter function public.delete_user_data(text)
  set search_path = pg_catalog, public, pg_temp;

-- SECURITY REVIEW NOTE (intentionally NOT changed here — could break the
-- legitimate caller): once delete_user_data is SECURITY DEFINER, any grantee of
-- EXECUTE can purge ANY user's audit trail by p_user_id. After confirming the
-- caller's role, consider:
--   revoke execute on function public.delete_user_data(text) from public;
--   grant  execute on function public.delete_user_data(text) to <gdpr_job_role>;

-- =============================================================================
-- VERIFICATION — run MANUALLY on a throwaway Neon BRANCH before applying to
-- production. The migration is NOT proven until BOTH directions pass. Deleting
-- test rows is fine on a branch. (Commented so it never runs during apply.)
-- =============================================================================
--
-- -- (a) Ownership precondition: SECURITY DEFINER only fixes the purges if the
-- --     function owner still has DELETE after the REVOKE. Owner must NOT be app_rls.
-- select p.proname, pg_get_userbyid(p.proowner) as owner, p.prosecdef
-- from pg_proc p join pg_namespace n on n.oid = p.pronamespace
-- where n.nspname = 'public'
--   and p.proname in ('cleanup_old_security_logs', 'delete_user_data');
-- --   EXPECT: prosecdef = true for both; owner <> 'app_rls'.
--
-- -- (b) Runtime role must be privilege-constrained, else the REVOKE is cosmetic.
-- select rolname, rolsuper, rolbypassrls from pg_roles where rolname = 'app_rls';
-- --   EXPECT: rolsuper = false. (rolbypassrls affects RLS, not table grants —
-- --   the REVOKE still applies regardless.)
--
-- -- (c) Direction 1 — immutability: as the runtime role, tampering is DENIED but
-- --     logging still works.
-- set role app_rls;
-- insert into public.security_audit_logs (event_type, severity)
--   values ('immut_test', 'info');                          -- EXPECT: success
-- select count(*) from public.security_audit_logs;          -- EXPECT: success
-- update public.security_audit_logs set severity = 'error'
--   where event_type = 'immut_test';                        -- EXPECT: permission denied
-- delete from public.security_audit_logs
--   where event_type = 'immut_test';                        -- EXPECT: permission denied
-- reset role;
--
-- -- (d) Direction 2 — the purges STILL delete (this is what catches a bad owner).
-- --     Run as the migration/owner role.
-- select public.cleanup_old_security_logs();                -- EXPECT: integer >= 0, no error
-- select public.delete_user_data('immut_test_nonexistent_user'); -- EXPECT: jsonb, no error
-- =============================================================================
