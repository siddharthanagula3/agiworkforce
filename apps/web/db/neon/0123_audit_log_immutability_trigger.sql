-- 0123 — close AUDIT-IMMUT-01 residue: make public.security_audit_logs
-- append-only by a mechanism a re-grant cannot undo.
--
-- WHAT 0043 LEFT OPEN
-- 0043_audit_log_immutability.sql revoked UPDATE and DELETE on
-- security_audit_logs from app_rls and said, in its own header, that the REVOKE
-- is not the durable fix: any future `grant ... on all tables in schema public
-- to app_rls` (0037:81 is exactly that statement) silently restores both
-- privileges, and nothing fails when it does. It named a BEFORE UPDATE OR
-- DELETE trigger as the durable mechanism and deferred it because the audit
-- table has to keep working for two SECURITY DEFINER purges. This migration
-- lands that trigger.
--
-- WHY THE DEFERRAL NO LONGER APPLIES
-- The two purges run as the FUNCTION owner, not as the caller —
-- cleanup_old_security_logs() (retention) and delete_user_data(text) (erasure)
-- were both made SECURITY DEFINER by 0043, and Postgres requires the migration
-- role to own a function to ALTER it that way, so their current_user inside the
-- function body is the same role that owns the table. The guard below admits
-- exactly that role, so both purges keep deleting. 0116 proved the same shape
-- on consent_records.
--
-- WHY THE GUARD IS "IS THIS THE TABLE OWNER" AND NOT "IS THIS app_rls"
-- A deny-list would admit any application role added later by default. The
-- owner check refuses every non-owner role, so a new runtime role has to be
-- deliberately given an owner-connection path rather than silently inheriting
-- the ability to rewrite audit history.
--
-- WHAT STILL HAS TO HOLD
-- The trigger is only as strong as the ownership precondition 0043 already
-- documented: app_rls must not own security_audit_logs. Verified by (a) below.

-- 1. Re-assert today's state. 0043 revoked these; re-issuing is idempotent and
--    removes whatever a blanket grant applied since.
revoke update, delete on public.security_audit_logs from app_rls;

-- 2. Make it survive the next blanket re-grant.
create or replace function public.security_audit_logs_forbid_mutation()
returns trigger
language plpgsql
as $$
declare
  table_owner text;
begin
  select pg_get_userbyid(relowner)
    into table_owner
    from pg_class
   where oid = 'public.security_audit_logs'::regclass;

  if current_user is distinct from table_owner then
    raise exception
      'security_audit_logs is append-only: % is not permitted for role %',
      tg_op, current_user
      using errcode = 'insufficient_privilege',
            hint = 'Audit history is corrected by appending a new event. Retention and erasure purge through the SECURITY DEFINER functions cleanup_old_security_logs() and delete_user_data().';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

comment on function public.security_audit_logs_forbid_mutation() is
  'Append-only guard for the security audit trail. Survives a blanket re-grant, which the 0043 REVOKE alone does not. Admits the table owner so the SECURITY DEFINER retention and erasure purges still run.';

drop trigger if exists security_audit_logs_append_only on public.security_audit_logs;
create trigger security_audit_logs_append_only
  before update or delete on public.security_audit_logs
  for each row
  execute function public.security_audit_logs_forbid_mutation();

-- =============================================================================
-- VERIFICATION — run MANUALLY on a throwaway Neon BRANCH. Both directions must
-- pass; a trigger that blocks the purges is worse than the REVOKE it replaces.
-- (Commented so it never runs during apply.)
-- =============================================================================
--
-- -- (a) Ownership precondition: the table owner must not be app_rls, and the
-- --     purge functions must be owned by that same role.
-- select relname, pg_get_userbyid(relowner) as owner
-- from pg_class where oid = 'public.security_audit_logs'::regclass;
-- select p.proname, pg_get_userbyid(p.proowner) as owner, p.prosecdef
-- from pg_proc p join pg_namespace n on n.oid = p.pronamespace
-- where n.nspname = 'public'
--   and p.proname in ('cleanup_old_security_logs', 'delete_user_data');
-- --   EXPECT: one owner for all three; owner <> 'app_rls'; prosecdef = true.
--
-- -- (b) Direction 1 — the trigger holds even after the footgun fires.
-- grant update, delete on public.security_audit_logs to app_rls;  -- simulate it
-- set role app_rls;
-- insert into public.security_audit_logs (event_type, severity)
--   values ('immut_test', 'info');                          -- EXPECT: success
-- update public.security_audit_logs set severity = 'error'
--   where event_type = 'immut_test';                        -- EXPECT: 42501
-- delete from public.security_audit_logs
--   where event_type = 'immut_test';                        -- EXPECT: 42501
-- reset role;
-- revoke update, delete on public.security_audit_logs from app_rls;
--
-- -- (c) Direction 2 — the legitimate purges still delete.
-- select public.cleanup_old_security_logs();                -- EXPECT: integer >= 0
-- select public.delete_user_data('immut_test_nonexistent_user'); -- EXPECT: jsonb
-- delete from public.security_audit_logs where event_type = 'immut_test';
-- --   EXPECT: success (owner connection), leaving the branch clean.
-- =============================================================================
