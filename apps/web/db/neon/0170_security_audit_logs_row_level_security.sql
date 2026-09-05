-- 0170 — put public.security_audit_logs behind row level security.
--
-- NOT YET APPLIED — draft only, pending explicit approval before running.
--
-- The table has carried user_id since 0014_security.sql, and app_rls has held
-- SELECT and (append-only, since 0043) INSERT on it the whole time, but
-- nothing has ever enabled row level security: any statement that reached the
-- table through app_rls saw or could log against every account's rows, not
-- only its own. api/settings/audit-logs, api/settings/audit-logs/actions and
-- api/settings/activity already run through getUserScopedDb (app_rls) and
-- already filter by the caller's user_id in SQL, so this migration is
-- behaviour-preserving for them and closes the backstop a future statement
-- that forgets that predicate would otherwise have none of.
--
-- user_id is nullable: logAuthFailure and the rest of lib/security-audit.ts
-- record failed and unauthenticated attempts with no subject to bind, and
-- insert through the privileged owner connection, which bypasses RLS exactly
-- as the retention purge and GDPR erasure in 0043 already do — no policy
-- decision here can affect that path. The INSERT policy below exists so a
-- future app_rls-scoped write is possible at all: it allows a null user_id
-- (an unauthenticated event) or the caller's own id, never a forged one.
--
-- app_rls holds SELECT and INSERT only — 0043 revoked UPDATE and DELETE to
-- keep the log append-only. This migration does not touch that grant and
-- must never restate a blanket GRANT here: 0043's header names that exact
-- mistake as the re-grant footgun, and scripts/check-neon-migrations.mjs
-- separately refuses any migration that grants on ALL TABLES IN SCHEMA public.

alter table public.security_audit_logs enable row level security;
alter table public.security_audit_logs force row level security;

drop policy if exists security_audit_logs_select_own on public.security_audit_logs;
create policy security_audit_logs_select_own
  on public.security_audit_logs
  for select to app_rls
  using (user_id = (select public.current_app_user_id()));

drop policy if exists security_audit_logs_insert_own on public.security_audit_logs;
create policy security_audit_logs_insert_own
  on public.security_audit_logs
  for insert to app_rls
  with check (
    user_id is null
    or user_id = (select public.current_app_user_id())
  );

comment on table public.security_audit_logs is
  'Security and audit trail. Row level security is enforced: app_rls reads only the signed-in account''s own rows and can insert only for itself or with no subject; the owner connection (writes, retention, GDPR erasure) bypasses RLS unchanged.';
