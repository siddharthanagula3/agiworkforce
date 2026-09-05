-- 0172 — put public.content_reports behind row level security.
--
-- NOT YET APPLIED — draft only, pending explicit approval before running.
--
-- The table has carried a nullable user_id since 0093_content_reports.sql.
-- Every statement against it today runs on the privileged owner connection
-- (api/mobile/content-report/route.ts intake, lib/server/
-- content-report-triage.ts moderation queue, lib/server/account-erasure.ts),
-- so this migration changes no live behaviour; it closes the same backstop
-- 0073 closed for media_assets — a table with a tenant column and nothing
-- enforcing it, one forgotten predicate away from an open cross-account read.
--
-- user_id is nullable by design (0093's header: reporting is reachable from
-- Local mode with no Cloud account), the same shape as security_audit_logs
-- and public.feedback. The INSERT policy allows a null user_id or the
-- caller's own id, never a forged one. There is no UPDATE or DELETE policy:
-- nothing runs those through app_rls today — the triage queue's status
-- transitions and the retention/erasure deletes stay on the owner
-- connection, which bypasses RLS unchanged.

alter table public.content_reports enable row level security;
alter table public.content_reports force row level security;

drop policy if exists content_reports_select_own on public.content_reports;
create policy content_reports_select_own
  on public.content_reports
  for select to app_rls
  using (user_id = (select public.current_app_user_id()));

drop policy if exists content_reports_insert_own on public.content_reports;
create policy content_reports_insert_own
  on public.content_reports
  for insert to app_rls
  with check (
    user_id is null
    or user_id = (select public.current_app_user_id())
  );

comment on table public.content_reports is
  'Trust-and-safety content reports. Row level security is enforced: app_rls reads only the reporting account''s own rows and can insert only for itself or with no subject; the owner connection (intake, triage, retention) bypasses RLS unchanged.';
