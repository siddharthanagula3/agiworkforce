-- =============================================================================
-- Migration 0417: a durable cleanup record for each feedback screenshot upload
--
-- NOT YET APPLIED : draft only, pending explicit approval before running.
--
-- Why    : a feedback screenshot is uploaded before the report that names it is
--          inserted. When the insert failed, the route deleted the upload, and
--          when that delete failed too nothing anywhere knew the object
--          existed: no feedback row carried its key, so account erasure, which
--          finds screenshots through feedback rows, could never reach it and
--          the storage bill kept it for good.
--
-- Shape  : feedback_screenshot_cleanups holds one row per screenshot key. The
--          route writes it before it uploads, so the key is on record whatever
--          happens next, and deletes it in the same transaction that inserts the
--          report, so a row that outlives its request means the report was
--          never stored. The media purge cron, which runs daily, deletes the
--          object of each row older than an hour and then the row. Account
--          erasure deletes the objects of the account's rows with the rest of
--          its screenshots.
--
--          user_id is null for a report sent with no account, like
--          public.feedback. Signed-in writes run as app_rls under an owner-only
--          policy; signed-out writes, the sweep and erasure use the owner
--          connection, which bypasses row level security.
--
-- Empty  : a new table, nothing to backfill. Screenshots orphaned before this
--          migration have no record and stay unreachable.
--
-- Depends: 0037 (current_app_user_id)
-- =============================================================================

begin;

create table if not exists public.feedback_screenshot_cleanups (
  storage_key text primary key check (length(storage_key) between 1 and 512),
  user_id text,
  created_at timestamptz not null default now()
);

create index if not exists idx_feedback_screenshot_cleanups_created_at
  on public.feedback_screenshot_cleanups (created_at);

create index if not exists idx_feedback_screenshot_cleanups_user_id
  on public.feedback_screenshot_cleanups (user_id)
  where user_id is not null;

revoke all on public.feedback_screenshot_cleanups from public, app_rls;
grant select, insert, delete on public.feedback_screenshot_cleanups to app_rls;

alter table public.feedback_screenshot_cleanups enable row level security;
alter table public.feedback_screenshot_cleanups force row level security;

drop policy if exists feedback_screenshot_cleanups_owner on public.feedback_screenshot_cleanups;
create policy feedback_screenshot_cleanups_owner
  on public.feedback_screenshot_cleanups
  for all to app_rls
  using (user_id = (select public.current_app_user_id()))
  with check (user_id = (select public.current_app_user_id()));

comment on table public.feedback_screenshot_cleanups is
  'A screenshot key written before its upload and deleted when its feedback report is stored. A row older than an hour is an object no report names, swept by the media purge cron and erased with the account.';

commit;
