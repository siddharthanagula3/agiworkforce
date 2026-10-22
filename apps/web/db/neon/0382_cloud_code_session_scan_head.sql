-- =============================================================================
-- Migration 0382: the latest security scan report of a Code session
--
-- NOT YET APPLIED : draft only, pending explicit approval before running.
--
-- Why    : A signed security scan report is stored as a file inside the
--          session's sandbox, which can be restored to an earlier snapshot. The
--          signature proves the server wrote a report for this user and
--          session, not that it is the latest one, so an older valid report,
--          with its findings still open, could be put back and acted on again.
--
-- Shape  : security_scan_id and security_scan_issued_at on cloud_code_sessions
--          name the report the server wrote last: its scan id and the time the
--          envelope was issued. The report writer sets both under the session's
--          run lease before it writes the file; the reader refuses a report
--          whose scan id or issue time differs, and refuses any report while
--          both are null. Null stays meaningful: a session that never ran a
--          scan, and every session from before this column, has no report the
--          server vouches for, so a stored one is not served.
--
-- Depends: 0075 (cloud_code_sessions)
-- =============================================================================

begin;

alter table public.cloud_code_sessions
  add column if not exists security_scan_id uuid,
  add column if not exists security_scan_issued_at timestamptz;

comment on column public.cloud_code_sessions.security_scan_id is
  'Scan id of the latest security scan report the server wrote for this session. A stored report with another scan id is refused. Null until the session runs a scan.';
comment on column public.cloud_code_sessions.security_scan_issued_at is
  'When the envelope of the latest security scan report was issued. A stored report issued at another time is refused, so an earlier state of the same scan cannot be restored. Null until the session runs a scan.';

commit;
