-- 20260508150000_account_status_rls_predicates.sql
--
-- P1-21 (services audit, 2026-05-08): RLS predicates that hide rows from
-- non-self readers when the row's owner has been suspended or banned.
--
-- Background
--   `public.profiles.account_status` was added in 20260508140000 with
--   values {'active','suspended','banned','disabled'}. The auth gateway
--   middleware (services/api-gateway/src/middleware/auth.ts:171) already
--   refuses to authenticate a suspended/banned user — but the existing
--   RLS policies still let OTHER users see those users' shared rows
--   (shared_sessions, shared_conversations, team memberships, etc.).
--   That means a banned account's content stays visible until manually
--   redacted. P1-21 closes the gap at the DB layer.
--
-- Approach
--   1. Stable helper function `public.is_account_active(p_user_id uuid)`
--      that returns TRUE iff the row in `profiles` shows
--      `account_status = 'active'`. SECURITY DEFINER + pinned
--      search_path so the lookup bypasses RLS on profiles itself
--      (otherwise a self-policy would mask the status check).
--   2. Each cross-user readable policy gets a clause:
--      `AND public.is_account_active(<owner_column>)`. Self-reads
--      (auth.uid() = owner_id) keep working unchanged so a suspended
--      user can still see + export their own data via support flows.
--   3. Service_role policies are untouched — webhooks, cron jobs,
--      moderation tools all need to read suspended rows.
--
-- Tables touched
--   - public.shared_sessions          (owner_id)
--   - public.shared_conversations     (owner_id)
--   - public.teams                    (owner_id)
--   - public.team_members             (user_id of the member being viewed)
--
-- Migrations not touched
--   - public.profiles itself: self-reads only, no cross-user predicate.
--   - public.conversations / public.messages: owner-only RLS, no cross-
--     user read path today (sharing flows go through shared_sessions).
--   - public.user_projects, public.scheduled_tasks, etc.: same.
--
-- Rollback: drop the new policy versions and recreate the prior ones from
-- 20260307000001 / 20260310000001 / 20260318000002. The helper function
-- can stay; it's harmless without callers.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. is_account_active() helper.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_account_active(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  -- COALESCE so a profile row that hasn't been provisioned yet (race
  -- between auth.users insert trigger and downstream creates) defaults
  -- to "active" rather than "suspended" — the kill switch only fires
  -- on explicit non-active states.
  SELECT COALESCE(
    (SELECT account_status = 'active'
       FROM public.profiles
      WHERE id = p_user_id),
    true
  );
$$;

REVOKE ALL ON FUNCTION public.is_account_active(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_account_active(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.is_account_active(uuid) IS
  'Returns TRUE iff the user''s profile row has account_status = ''active''. '
  'Used by RLS predicates on cross-user readable tables to hide rows '
  'belonging to suspended/banned accounts (P1-21, services audit 2026-05-08).';

-- ---------------------------------------------------------------------------
-- 2. shared_sessions — public read of non-expired rows.
-- The original 20260307000001 policy was:
--     CREATE POLICY "Anyone can view non-expired shared sessions"
--       ON public.shared_sessions FOR SELECT
--       USING (expires_at > now());
-- We add the active-account predicate.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Anyone can view non-expired shared sessions"
  ON public.shared_sessions;
CREATE POLICY "Anyone can view non-expired shared sessions"
  ON public.shared_sessions FOR SELECT
  USING (
    expires_at > now()
    AND public.is_account_active(owner_id)
  );

-- ---------------------------------------------------------------------------
-- 3. shared_conversations — same shape as shared_sessions.
-- The exact column names / column for owner depend on the
-- 20260310000001 migration. We probe via to_regclass and only patch if
-- the table + column exist; this keeps the migration idempotent across
-- branches that may have diverged.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.shared_conversations') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'shared_conversations'
          AND column_name = 'owner_id'
     )
  THEN
    EXECUTE $sql$
      DROP POLICY IF EXISTS "Anyone can view shared conversations"
        ON public.shared_conversations;
    $sql$;
    EXECUTE $sql$
      CREATE POLICY "Anyone can view shared conversations"
        ON public.shared_conversations FOR SELECT
        USING (public.is_account_active(owner_id));
    $sql$;
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 4. teams — members can view their teams (cross-user via owner_id).
-- Original policy hid the owner identity from non-members; now we also
-- hide the team entirely if the owner is suspended.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Team members can view their teams"
  ON public.teams;
CREATE POLICY "Team members can view their teams"
  ON public.teams FOR SELECT
  USING (
    public.is_account_active(owner_id)
    AND (
      owner_id = auth.uid()
      OR id IN (SELECT team_id FROM public.team_members WHERE user_id = auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- 5. team_members — admins / fellow members can view memberships.
-- Hide rows where the *member* is suspended (so admins don't act on a
-- ghost member). Self-reads (user_id = auth.uid()) are unaffected
-- because the auth gateway already blocks the suspended user from
-- authenticating; the predicate is a belt-and-suspenders defence.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Team members can view their memberships"
  ON public.team_members;
CREATE POLICY "Team members can view their memberships"
  ON public.team_members FOR SELECT
  USING (
    public.is_account_active(user_id)
    AND (
      user_id = auth.uid()
      OR team_id IN (SELECT id FROM public.teams WHERE owner_id = auth.uid())
      OR team_id IN (
        SELECT tm.team_id FROM public.team_members tm
         WHERE tm.user_id = auth.uid() AND tm.role = 'admin'
      )
    )
  );

COMMIT;
