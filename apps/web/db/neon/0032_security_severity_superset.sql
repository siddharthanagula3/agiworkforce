-- Migration 0032: expand security_audit_logs severity CHECK to superset
--
-- The app-level taxonomy (security-audit.ts) uses low/medium/high/critical,
-- but the original constraint (0014_security.sql) only accepted
-- info/warning/error/critical. Rows with severity='low', 'medium', or 'high'
-- violated the CHECK (Postgres error 23514) and were silently dropped by the
-- surrounding try/catch. The existing RPC default of 'info' still passes.
--
-- This migration replaces the constraint with a superset that accepts BOTH
-- taxonomies so that every current insert succeeds and no existing row is
-- rejected. The app-level type is NOT changed; this is a DB-only fix.

ALTER TABLE public.security_audit_logs
  DROP CONSTRAINT IF EXISTS security_audit_logs_severity_check,
  ADD CONSTRAINT security_audit_logs_severity_check
  CHECK (severity = ANY (ARRAY[
    'info'::text,
    'warning'::text,
    'error'::text,
    'critical'::text,
    'low'::text,
    'medium'::text,
    'high'::text
  ]));
