-- =============================================================================
-- Migration: 0037_rls_user_isolation.sql
-- Purpose  : Enable Row-Level Security on all user-scoped tables so that the
--            database enforces user isolation as a second layer of defense
--            behind the application-layer .eq('user_id') filter.
--
-- STATUS: DO NOT APPLY WITHOUT COMPLETING THE PRE-FLIGHT CHECKLIST BELOW.
--
-- Pre-flight checklist (must be done on a Neon branch, not production):
--   1. Verify the connection role:
--        SELECT current_user, session_user;
--      If the role is the table owner, RLS is bypassed by default —
--      FORCE ROW LEVEL SECURITY (included below) is required.
--   2. Verify the API gateway sets the session variable on every request:
--        SET LOCAL app.user_id = '<clerk_user_id>';
--      This must happen inside the transaction or via SET in the connection
--      prologue. The PostgREST / Neon driver approach is:
--        db.query("SET LOCAL app.user_id = $1", [userId])
--      before any per-user query in the same transaction.
--   3. Test on a Neon branch:
--        neon branches create --name rls-test
--        neon database restore --branch rls-test
--        psql $NEON_BRANCH_URL -f 0037_rls_user_isolation.sql
--      Then run the full integration test suite against the branch.
--   4. Confirm no service account (background jobs, admin scripts) relies on
--      unrestricted table access — those must use a BYPASSRLS role or a
--      dedicated admin connection string.
--
-- Rollback:
--   ALTER TABLE public.web_conversations DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE public.web_messages NO FORCE ROW LEVEL SECURITY;
--   DROP POLICY IF EXISTS web_conversations_user_isolation ON public.web_conversations;
--   -- (repeat for each table below)
--
-- Author : 3-tier isolation audit 2026-06-20 (gap #4)
-- Applies: production — ONLY after pre-flight on branch
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Helper: current_app_user_id()
-- Returns the user id injected by the application layer via SET LOCAL.
-- Using a function rather than inlining current_setting() everywhere keeps
-- policies readable and lets us change the variable name in one place.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_app_user_id()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT current_setting('app.user_id', true);
$$;

-- ---------------------------------------------------------------------------
-- web_conversations + web_messages (0001_mvp_chat)
-- web_messages has no user_id column — it inherits isolation via the FK to
-- web_conversations, so we use a subquery policy.
-- ---------------------------------------------------------------------------
ALTER TABLE public.web_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.web_conversations FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS web_conversations_user_isolation ON public.web_conversations;
CREATE POLICY web_conversations_user_isolation
  ON public.web_conversations
  USING (user_id = public.current_app_user_id());

ALTER TABLE public.web_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.web_messages FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS web_messages_user_isolation ON public.web_messages;
CREATE POLICY web_messages_user_isolation
  ON public.web_messages
  USING (
    conversation_id IN (
      SELECT id FROM public.web_conversations
      WHERE user_id = public.current_app_user_id()
    )
  );

-- ---------------------------------------------------------------------------
-- profiles (0002_profiles)
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profiles_user_isolation ON public.profiles;
CREATE POLICY profiles_user_isolation
  ON public.profiles
  USING (user_id = public.current_app_user_id());

-- ---------------------------------------------------------------------------
-- subscriptions (0003_subscriptions)
-- ---------------------------------------------------------------------------
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS subscriptions_user_isolation ON public.subscriptions;
CREATE POLICY subscriptions_user_isolation
  ON public.subscriptions
  USING (user_id = public.current_app_user_id());

-- ---------------------------------------------------------------------------
-- token_credits + credit_transactions (0004_token_credits)
-- credit_transactions is linked via user_id directly.
-- ---------------------------------------------------------------------------
ALTER TABLE public.token_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.token_credits FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS token_credits_user_isolation ON public.token_credits;
CREATE POLICY token_credits_user_isolation
  ON public.token_credits
  USING (user_id = public.current_app_user_id());

ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_transactions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS credit_transactions_user_isolation ON public.credit_transactions;
CREATE POLICY credit_transactions_user_isolation
  ON public.credit_transactions
  USING (user_id = public.current_app_user_id());

-- ---------------------------------------------------------------------------
-- api_keys (0005_api_keys)
-- ---------------------------------------------------------------------------
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_keys FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS api_keys_user_isolation ON public.api_keys;
CREATE POLICY api_keys_user_isolation
  ON public.api_keys
  USING (user_id = public.current_app_user_id());

-- ---------------------------------------------------------------------------
-- user_projects + project_knowledge_files (0006_projects)
-- ---------------------------------------------------------------------------
ALTER TABLE public.user_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_projects FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_projects_user_isolation ON public.user_projects;
CREATE POLICY user_projects_user_isolation
  ON public.user_projects
  USING (user_id = public.current_app_user_id());

ALTER TABLE public.project_knowledge_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_knowledge_files FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_knowledge_files_user_isolation ON public.project_knowledge_files;
CREATE POLICY project_knowledge_files_user_isolation
  ON public.project_knowledge_files
  USING (
    project_id IN (
      SELECT id FROM public.user_projects
      WHERE user_id = public.current_app_user_id()
    )
  );

-- ---------------------------------------------------------------------------
-- user_memories (0010_memory)
-- ---------------------------------------------------------------------------
ALTER TABLE public.user_memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_memories FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_memories_user_isolation ON public.user_memories;
CREATE POLICY user_memories_user_isolation
  ON public.user_memories
  USING (user_id = public.current_app_user_id());

-- ---------------------------------------------------------------------------
-- Verification queries — run these on the branch after applying:
-- ---------------------------------------------------------------------------
-- SELECT tablename, rowsecurity, forcerowsecurity
-- FROM pg_tables
-- WHERE schemaname = 'public'
--   AND tablename IN (
--     'web_conversations', 'web_messages', 'profiles', 'subscriptions',
--     'token_credits', 'credit_transactions', 'api_keys', 'user_projects',
--     'project_knowledge_files', 'user_memories'
--   )
-- ORDER BY tablename;
--
-- All rows should show: rowsecurity = true, forcerowsecurity = true
