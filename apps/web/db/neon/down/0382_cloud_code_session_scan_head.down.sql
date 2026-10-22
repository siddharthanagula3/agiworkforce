-- Reversal of 0382 : forget the latest security scan report of a Code session.
--
-- WHAT THIS COSTS: the server no longer knows which stored scan report is the
-- latest, so code that reads the two columns must be reverted first. Without
-- them an older valid report restored into a session's sandbox is served
-- again, and its findings can be approved a second time. The reports in the
-- sandboxes are untouched.

begin;

alter table public.cloud_code_sessions
  drop column if exists security_scan_issued_at,
  drop column if exists security_scan_id;

delete from public.schema_migrations
 where filename = '0382_cloud_code_session_scan_head.sql';

commit;
