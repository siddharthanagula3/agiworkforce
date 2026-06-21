-- =============================================================================
-- Migration: 0037_rls_user_isolation.sql
-- Purpose  : Enable Row-Level Security on all user-scoped tables so the database
--            enforces per-user isolation as a second layer of defense behind the
--            application-layer `where user_id = $1` filter. Cross-tenant READS
--            (USING) and cross-tenant WRITES (WITH CHECK) are both rejected.
--
-- [Tranche-1] Security floor — supersedes the earlier draft of this migration.
-- Two correctness fixes vs the draft:
--   1. GUC ALIGNMENT: policies now read `request.jwt.claim.sub`, the GUC the
--      data-layer adapter actually binds (packages/data-layer/src/adapters/
--      neon.ts: `SET LOCAL request.jwt.claim.sub = ...`). The draft read
--      `app.user_id`, which no code ever set, so every policy denied all rows.
--   2. EXPLICIT WITH CHECK on every policy so cross-tenant INSERT/UPDATE are
--      rejected at the DB layer (not only relying on USING-as-implicit-check).
--   3. `profiles` is keyed by `id` (the Clerk user id IS the primary key); it has
--      NO `user_id` column, so its policy uses `id`, not `user_id`. The draft
--      referenced a non-existent `profiles.user_id` and would have failed to apply.
--
-- HOW TO APPLY (branch-first; an apply script + a cross-tenant probe ship with it):
--   neonctl branches create --name <test-branch>
--   DATABASE_URL="<branch-url>" node apps/web/scripts/apply-rls.mjs
--   DATABASE_URL="<branch-url>" node apps/web/scripts/rls-probe.mjs   # must PASS
--   # then apply to production only after the probe passes on the branch.
--
-- PRODUCTION ENFORCEMENT CAVEAT (tracked follow-up, NOT in this migration):
--   RLS only bites when the app sets the GUC per request. The data-layer
--   `withUser()` path does this, but the live web query path currently uses
--   `getNeonDb()` without `withUser()`, so it would not set the GUC. Wiring the
--   live path through `withUser()` (or an equivalent SET LOCAL) is required for
--   production isolation and is a separate change (it touches the shared
--   data-layer/query path). Until then this migration is correct-but-dormant for
--   the live path; app-layer `where user_id = $1` remains the active control.
--
-- Rollback:
--   ALTER TABLE public.web_conversations NO FORCE ROW LEVEL SECURITY;
--   ALTER TABLE public.web_conversations DISABLE ROW LEVEL SECURITY;
--   DROP POLICY IF EXISTS web_conversations_user_isolation ON public.web_conversations;
--   -- (repeat for each table below)
--
-- Author : [Tranche-1] security floor 2026-06-20 (Alpha)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Helper: current_app_user_id()
-- Returns the user id injected by the application layer via
-- `SET LOCAL request.jwt.claim.sub = '<clerk_user_id>'`. Returns NULL when the
-- GUC is unset, so every USING/WITH CHECK comparison fails closed (deny) rather
-- than matching arbitrary rows.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_app_user_id()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT current_setting('request.jwt.claim.sub', true);
$$;

-- ---------------------------------------------------------------------------
-- RLS ENFORCEMENT ROLE: app_rls   (the privilege restriction)
-- A role with BYPASSRLS (Neon's owner role HAS it) and superusers bypass ALL
-- policies regardless of FORCE ROW LEVEL SECURITY. The cross-tenant probe
-- proved the owner connection bypasses every policy below. So app RUNTIME
-- queries MUST run as a NON-BYPASSRLS role. We create a dedicated, login-less
-- `app_rls` role with minimal DML grants; the data-layer adapter does
-- `SET LOCAL ROLE app_rls` inside withUser() so per-user queries are subject to
-- RLS. Migrations/admin keep running as the owner (BYPASSRLS) for unrestricted
-- schema access. (On Neon the owner is NOT a superuser, so `ALTER ROLE …
-- NOBYPASSRLS` is not permitted — a dedicated restricted role is the path.)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_rls') THEN
    CREATE ROLE app_rls NOLOGIN NOBYPASSRLS;
  END IF;
END
$$;

-- Table-level access only; RLS still restricts WHICH rows app_rls may touch.
GRANT USAGE ON SCHEMA public TO app_rls;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_rls;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_rls;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_rls;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO app_rls;

-- Allow the connecting (owner) role to `SET ROLE app_rls`.
GRANT app_rls TO CURRENT_USER;

-- ---------------------------------------------------------------------------
-- web_conversations + web_messages (0001_mvp_chat)
-- web_messages has no user_id column — it inherits isolation via the FK to
-- web_conversations, so its policy uses a subquery for both USING and WITH CHECK.
-- ---------------------------------------------------------------------------
ALTER TABLE public.web_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.web_conversations FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS web_conversations_user_isolation ON public.web_conversations;
CREATE POLICY web_conversations_user_isolation
  ON public.web_conversations
  USING (user_id = public.current_app_user_id())
  WITH CHECK (user_id = public.current_app_user_id());

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
  )
  WITH CHECK (
    conversation_id IN (
      SELECT id FROM public.web_conversations
      WHERE user_id = public.current_app_user_id()
    )
  );

-- ---------------------------------------------------------------------------
-- profiles (0002_profiles)
-- profiles is keyed by `id` (= the Clerk user id). It has NO `user_id` column,
-- so the policy compares `id` directly.
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profiles_user_isolation ON public.profiles;
CREATE POLICY profiles_user_isolation
  ON public.profiles
  USING (id = public.current_app_user_id())
  WITH CHECK (id = public.current_app_user_id());

-- ---------------------------------------------------------------------------
-- subscriptions (0003_subscriptions)
-- ---------------------------------------------------------------------------
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS subscriptions_user_isolation ON public.subscriptions;
CREATE POLICY subscriptions_user_isolation
  ON public.subscriptions
  USING (user_id = public.current_app_user_id())
  WITH CHECK (user_id = public.current_app_user_id());

-- ---------------------------------------------------------------------------
-- token_credits + credit_transactions (0004_token_credits)
-- ---------------------------------------------------------------------------
ALTER TABLE public.token_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.token_credits FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS token_credits_user_isolation ON public.token_credits;
CREATE POLICY token_credits_user_isolation
  ON public.token_credits
  USING (user_id = public.current_app_user_id())
  WITH CHECK (user_id = public.current_app_user_id());

ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_transactions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS credit_transactions_user_isolation ON public.credit_transactions;
CREATE POLICY credit_transactions_user_isolation
  ON public.credit_transactions
  USING (user_id = public.current_app_user_id())
  WITH CHECK (user_id = public.current_app_user_id());

-- ---------------------------------------------------------------------------
-- api_keys (0005_api_keys)
-- ---------------------------------------------------------------------------
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_keys FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS api_keys_user_isolation ON public.api_keys;
CREATE POLICY api_keys_user_isolation
  ON public.api_keys
  USING (user_id = public.current_app_user_id())
  WITH CHECK (user_id = public.current_app_user_id());

-- ---------------------------------------------------------------------------
-- user_projects + project_knowledge_files (0006_projects)
-- ---------------------------------------------------------------------------
ALTER TABLE public.user_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_projects FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_projects_user_isolation ON public.user_projects;
CREATE POLICY user_projects_user_isolation
  ON public.user_projects
  USING (user_id = public.current_app_user_id())
  WITH CHECK (user_id = public.current_app_user_id());

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
  )
  WITH CHECK (
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
  USING (user_id = public.current_app_user_id())
  WITH CHECK (user_id = public.current_app_user_id());

-- ---------------------------------------------------------------------------
-- Verification (run on the branch after applying; rls-probe.mjs automates this):
--   SELECT relname, relrowsecurity, relforcerowsecurity
--   FROM pg_class
--   WHERE relnamespace = 'public'::regnamespace
--     AND relname IN (
--       'web_conversations','web_messages','profiles','subscriptions',
--       'token_credits','credit_transactions','api_keys','user_projects',
--       'project_knowledge_files','user_memories'
--     )
--   ORDER BY relname;
--   -- All rows must show relrowsecurity = true AND relforcerowsecurity = true.
-- ---------------------------------------------------------------------------
