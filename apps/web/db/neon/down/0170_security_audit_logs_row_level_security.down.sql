-- Reversal of 0170 — take public.security_audit_logs back out of row level
-- security.
--
-- WHAT THIS COSTS: app_rls again sees and can insert against every account's
-- audit rows through any statement that runs on that connection, exactly as
-- before this migration. The append-only grant from 0043 is untouched either
-- way — UPDATE and DELETE remain revoked for app_rls regardless of this
-- reversal.

begin;

drop policy if exists security_audit_logs_select_own on public.security_audit_logs;
drop policy if exists security_audit_logs_insert_own on public.security_audit_logs;
alter table public.security_audit_logs no force row level security;
alter table public.security_audit_logs disable row level security;

delete from public.schema_migrations
 where filename = '0170_security_audit_logs_row_level_security.sql';

commit;
