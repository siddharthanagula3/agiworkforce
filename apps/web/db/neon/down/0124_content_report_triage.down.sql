-- Down for 0124: remove triage state from public.content_reports.
--
-- READ THIS BEFORE ROLLING BACK. The reports themselves survive — 0093 owns the
-- table and this reversal does not touch it. What is destroyed is every
-- disposition a reviewer recorded: who claimed a report, what they decided, why,
-- and when. `security_audit_logs` keeps a 'content_report_review' event per
-- action, so the decisions can be reconstructed by hand, but the queue itself
-- goes back to being an undifferentiated pile and previously worked reports
-- reappear as unclaimed.
--
-- Export first if any row has been reviewed:
--
--   \copy (select id, status, reviewer_id, reviewer_note, reviewed_at from public.content_reports where status <> 'received') to 'content_report_triage.csv' csv header

begin;

drop index if exists public.idx_content_reports_open;

alter table public.content_reports
  drop constraint if exists content_reports_status_check;

alter table public.content_reports
  drop column if exists updated_at;

alter table public.content_reports
  drop column if exists reviewed_at;

alter table public.content_reports
  drop column if exists reviewer_note;

alter table public.content_reports
  drop column if exists reviewer_id;

alter table public.content_reports
  drop column if exists status;

delete from public.schema_migrations where filename = '0124_content_report_triage.sql';

commit;
