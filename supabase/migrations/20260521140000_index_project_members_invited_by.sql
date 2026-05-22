-- 20260521140000_index_project_members_invited_by.sql
--
-- Self-audit follow-up for 20260521120000_project_schema_round_10.sql.
--
-- public.project_members has a FK on invited_by_user_id → auth.users(id)
-- with ON DELETE SET NULL but no index. Two real consequences:
--
--   1. Cascading deletion (when an auth user is deleted) becomes O(N) over
--      project_members. With member counts in the hundreds-of-thousands
--      range, user-deletion latency would balloon.
--   2. Any future "show me everyone I've invited" or audit-trail filter on
--      invited_by_user_id triggers a full table scan.
--
-- Postgres does NOT auto-index FK columns (unlike, e.g., MySQL InnoDB on
-- secondary keys). The fix is one CREATE INDEX. Idempotent via IF NOT
-- EXISTS so reruns are safe.

CREATE INDEX IF NOT EXISTS idx_project_members_invited_by_user_id
  ON public.project_members(invited_by_user_id)
  WHERE invited_by_user_id IS NOT NULL;
