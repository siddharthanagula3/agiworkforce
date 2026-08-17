-- Reversal of 0123 — drop the append-only trigger on public.security_audit_logs.
--
-- WHAT THIS COSTS: the audit trail falls back to the 0043 REVOKE alone, which
-- any `grant ... on all tables in schema public to app_rls` silently undoes.
-- Run this only to unblock a purge the trigger is wrongly refusing (see the
-- ownership precondition in the up migration), never as part of rolling back an
-- unrelated deploy.
--
-- The 0043 REVOKE is deliberately NOT re-granted here: the state before 0123 is
-- the state 0043 produced, which is app_rls without UPDATE or DELETE.

BEGIN;

drop trigger if exists security_audit_logs_append_only on public.security_audit_logs;
drop function if exists public.security_audit_logs_forbid_mutation();

delete from public.schema_migrations where filename = '0123_audit_log_immutability_trigger.sql';

COMMIT;
