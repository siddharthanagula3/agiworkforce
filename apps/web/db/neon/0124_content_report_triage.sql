-- 0124 — triage state for GenAI content reports.
--
-- 0093 created public.content_reports as an append-only sink and stopped there.
-- The row could record that a report arrived; it had no column that could
-- record what a human did about it, so every report sat in the same
-- indistinguishable state forever and no reviewer could tell an unread report
-- from one already worked. The mobile report sheet tells the reporter their
-- report "was sent to the AGI safety team for review"
-- (apps/mobile/src/features/chat/components/ReportFlagButton.tsx), and Google
-- Play's GenAI policy requires that flagged content actually reach the
-- operator. Both claims need a queue with state, not a log.
--
-- The reads this table now serves are the open queue (oldest first, so nothing
-- starves) and the existing newest-first history. Resolved rows leave the open
-- index through the partial predicate rather than being deleted: a report is
-- moderation evidence and outlives its disposition.
--
-- ERASURE CLASSIFICATION IS UNCHANGED
-- content_reports stays out of USER_SCOPED_TABLES for the reason
-- lib/server/account-erasure.ts records: a report is evidence about someone
-- else's content. reviewer_id is a plain text column, never a cascading
-- reference — deleting a reviewer's account must not erase who reviewed what.

alter table public.content_reports
  add column if not exists status text not null default 'received';

alter table public.content_reports
  add column if not exists reviewer_id text;

alter table public.content_reports
  add column if not exists reviewer_note text;

alter table public.content_reports
  add column if not exists reviewed_at timestamptz;

alter table public.content_reports
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'content_reports_status_check'
  ) then
    alter table public.content_reports
      add constraint content_reports_status_check
      check (status = any (array['received', 'in_review', 'actioned', 'dismissed']));
  end if;
end
$$;

create index if not exists idx_content_reports_open
  on public.content_reports (created_at)
  where status in ('received', 'in_review');

comment on column public.content_reports.status is
  'received on intake; in_review once a reviewer claims it; actioned when the report changed something; dismissed when it did not.';
comment on column public.content_reports.reviewer_id is
  'Plain text, not a reference: deleting a reviewer account must not erase who reviewed a report.';
comment on column public.content_reports.reviewer_note is
  'What the reviewer decided and why. Never returned to the reporter automatically.';
