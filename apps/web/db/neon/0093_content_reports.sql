-- 0093_content_reports.sql
--
-- GenAI content-report intake (MOBILE-CONTENT-REPORT-NO-INTAKE-ENDPOINT-01).
--
-- Google Play's GenAI policy requires an in-app mechanism for users to flag
-- harmful or inaccurate AI-generated content, AND that those reports actually
-- reach the operator. The mobile app previously had no server sink: reports
-- were stored on-device and, optionally, handed to the mail client. This table
-- is the durable trust-and-safety intake behind POST /api/mobile/content-report.
--
-- user_id is intentionally nullable: reporting is reachable from both Local and
-- Cloud mode, and a Local-only user with no Cloud account must still be able to
-- file a report (mirrors public.feedback in 0016_misc.sql).
--
-- client_report_id is the mobile-generated report id. It is unique so a client
-- retry after a flaky network never files the same report twice.

create table if not exists public.content_reports (
  id uuid primary key default gen_random_uuid(),
  user_id text,
  client_report_id text not null unique,
  message_id text not null,
  conversation_id text not null,
  category text not null
    check (category = any (array[
      'harmful', 'inaccurate', 'offensive', 'misinformation', 'privacy', 'other'
    ])),
  content_excerpt text not null default '',
  user_note text not null default '',
  metadata jsonb,
  created_at timestamptz not null default now()
);

-- Triage queue: newest reports first.
create index if not exists idx_content_reports_created_at
  on public.content_reports (created_at desc);

-- Per-user history (DSAR / abuse review); partial so anonymous rows don't bloat it.
create index if not exists idx_content_reports_user_id
  on public.content_reports (user_id, created_at desc)
  where user_id is not null;
