-- =============================================================================
-- Migration 0137: close the RLS gap on ten user-owned content tables
--
-- Why    : 0037 granted app_rls SELECT/INSERT/UPDATE/DELETE on ALL TABLES in
--          public (line 81, plus the ALTER DEFAULT PRIVILEGES that keeps doing
--          it for new tables). Ten tables holding user-owned rows were never
--          given RLS, so on those ten the grant is unconditional: the
--          NON-BYPASSRLS role every RLS-scoped route runs as can read and write
--          EVERY user's rows. That is not a missing defence-in-depth layer, it
--          is an open one — the only thing scoping those queries today is a
--          WHERE clause in application code.
--
--          The ten are the user-owned tables from the coverage audit:
--            user_two_factor      two-factor secrets and recovery codes
--            account_sessions     session records
--            notifications        per-user notifications
--            chat_folders         chat organisation
--            conversation_tags    chat organisation
--            message_bookmarks    saved messages
--            message_reactions    per-user reactions
--            user_shortcuts       per-user preferences
--            email_preferences    per-user preferences
--            search_history       search terms
--
--          `user_two_factor` and `search_history` are the two worth naming.
--          The first holds authentication material. The second holds free text
--          that 0110 already flagged: "Search text can itself contain
--          confidential project/customer terms."
--
-- Safe   : Neon's owner role has BYPASSRLS (see 0037's header), so every
--          privileged path — migrations, cron, webhooks, and the ~105 routes on
--          getNeonDb() — is unaffected by this migration. Only the app_rls role
--          changes behaviour, and only from "all rows" to "own rows", which is
--          what those routes already intend.
--
-- Shape  : Nine of the ten carry `user_id` and nothing else, so they get the
--          simple owner predicate. `search_history` also carries
--          `organization_id` (added by 0110), so it uses the SAME tenancy
--          helpers as the twelve content roots in 0073/0110 rather than a
--          second, subtly different rule — a workspace-scoped row must stay
--          invisible from Personal scope, and that logic already exists.
--
-- Depends: 0037_rls_user_isolation      (app_rls, current_app_user_id)
--          0073_tenancy_foundation      (app_row_is_visible/app_row_is_writable)
--          0110_active_workspace_content_scope (search_history.organization_id)
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- The nine user-only tables.
--
-- FORCE is set for the same reason 0073 sets it: it costs nothing here because
-- the owner has BYPASSRLS either way, and it means the policy still holds if
-- this schema is ever restored under an owner that does not.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
  user_owned_tables text[] := ARRAY[
    'user_two_factor', 'account_sessions', 'notifications', 'chat_folders',
    'conversation_tags', 'message_bookmarks', 'message_reactions',
    'user_shortcuts', 'email_preferences'
  ];
BEGIN
  FOREACH t IN ARRAY user_owned_tables LOOP
    -- Skip cleanly if a table is absent in this environment rather than
    -- aborting the whole migration on one missing relation.
    IF to_regclass(format('public.%I', t)) IS NULL THEN
      RAISE NOTICE '0137: skipping %, relation not present', t;
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_user_isolation', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO app_rls '
      'USING (user_id = public.current_app_user_id()) '
      'WITH CHECK (user_id = public.current_app_user_id())',
      t || '_user_isolation', t
    );
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- search_history: workspace-aware, so it reuses the 0073/0110 predicates.
--
-- A search made inside an organization must not surface in Personal scope, and
-- vice versa. app_row_is_visible already encodes exactly that, including the
-- owner/admin branch, so this table must not get its own hand-rolled variant.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.search_history') IS NULL THEN
    RAISE NOTICE '0137: skipping search_history, relation not present';
    RETURN;
  END IF;

  ALTER TABLE public.search_history ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.search_history FORCE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS search_history_tenant_isolation ON public.search_history;
  CREATE POLICY search_history_tenant_isolation
    ON public.search_history
    FOR ALL TO app_rls
    USING (public.app_row_is_visible(user_id, organization_id))
    WITH CHECK (public.app_row_is_writable(user_id, organization_id));
END $$;

COMMIT;

-- =============================================================================
-- VERIFICATION — run MANUALLY on a throwaway Neon BRANCH before production.
-- Vitest cannot prove any of this: every DB test in apps/web mocks the adapter,
-- so a green suite says nothing about role or policy behaviour here.
-- (Commented so it never runs during apply.)
-- =============================================================================
-- -- 1. Every one of the ten now reports RLS enabled and forced:
-- --    SELECT relname, relrowsecurity, relforcerowsecurity
-- --      FROM pg_class
-- --     WHERE relname IN ('user_two_factor','account_sessions','notifications',
-- --                       'chat_folders','conversation_tags','message_bookmarks',
-- --                       'message_reactions','user_shortcuts','email_preferences',
-- --                       'search_history');
-- --    EXPECT: relrowsecurity = t and relforcerowsecurity = t for all ten.
--
-- -- 2. app_rls sees only its own rows (the actual fix):
-- --    SET ROLE app_rls;
-- --    SET LOCAL request.jwt.claims = '{"sub":"<user-a>"}';
-- --    SELECT count(*) FROM public.user_two_factor;   -- EXPECT: only user-a's row
-- --    SELECT count(*) FROM public.notifications;      -- EXPECT: only user-a's rows
--
-- -- 3. app_rls cannot write a row it would not own (forgery is blocked):
-- --    SET ROLE app_rls;
-- --    SET LOCAL request.jwt.claims = '{"sub":"<user-a>"}';
-- --    INSERT INTO public.chat_folders (user_id, name) VALUES ('<user-b>', 'x');
-- --    EXPECT: ERROR new row violates row-level security policy.
--
-- -- 4. The privileged owner is unaffected (no privileged route regresses):
-- --    RESET ROLE;
-- --    SELECT count(*) FROM public.notifications;  -- EXPECT: all rows, as before.
--
-- -- 5. search_history respects workspace scope, not just ownership:
-- --    SET ROLE app_rls;
-- --    SET LOCAL request.jwt.claims = '{"sub":"<user-a>"}';   -- no org claim
-- --    SELECT count(*) FROM public.search_history
-- --     WHERE organization_id IS NOT NULL;  -- EXPECT: 0 (Personal cannot see org rows)
-- =============================================================================
