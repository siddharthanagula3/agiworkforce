-- =============================================================================
-- Security fix: replace `auth.role() = 'service_role'` (JWT-claim trust) with
-- `TO service_role` role-grant policies on every public-schema policy that
-- uses the antipattern.
-- Date: 2026-05-05
-- Source: docs/security/red-team-2026-05-04.md HIGH-1
--          (was H1/H2 in red-supabase agent report; ~22 sites identified.)
--
-- Background: Supabase's `auth.role()` returns the `role` claim from the
-- bearer JWT. Anyone with the project's `SUPABASE_JWT_SECRET` (web app,
-- signaling server, edge functions, leaked CI secret, leaked .env file in a
-- developer workstation backup) can mint
--    jwt.sign({ role:'service_role', sub: VICTIM_UUID }, JWT_SECRET)
-- and bypass every RLS policy that checks `auth.role() = 'service_role'`.
--
-- The Postgres-recommended pattern is `TO service_role`, which keys off the
-- connection role (set by the auth proxy only when the actual service-role
-- KEY is presented as the bearer). This is enforced by SET ROLE rather than
-- by trusting a claim.
--
-- This migration scans pg_policies for the antipattern and rewrites each
-- matching policy to the role-grant form. Compound policies (those whose
-- USING/WITH CHECK contains AND/OR/NOT alongside the service_role check) are
-- SKIPPED with a NOTICE so they can be hand-fixed.
--
-- Verification (after applying):
--   SELECT schemaname, tablename, policyname, qual
--   FROM pg_policies
--   WHERE schemaname = 'public'
--     AND (qual LIKE '%auth.role()%service_role%' OR with_check LIKE '%auth.role()%service_role%');
--   -- expect 0 rows for simple-pattern policies; any remaining are compounds
--   -- needing manual review.
--
-- Pre-deploy: run on staging first. Verify that every backend caller that
-- previously relied on `auth.role() = 'service_role'` is actually using the
-- service-role KEY (not a self-minted JWT with role='service_role'). The
-- web app, api-gateway, and edge functions all use the key — verified
-- 2026-05-05 by grep across the repo.
-- =============================================================================

DO $$
DECLARE
    pol record;
    qual_norm text;
    check_norm text;
    is_simple_qual boolean;
    is_simple_check boolean;
    rewrites_done int := 0;
    rewrites_skipped int := 0;
BEGIN
    FOR pol IN
        SELECT schemaname, tablename, policyname, qual, with_check, cmd, roles
        FROM pg_policies
        WHERE schemaname = 'public'
          AND (
              qual LIKE '%auth.role()%service_role%'
              OR with_check LIKE '%auth.role()%service_role%'
          )
    LOOP
        -- Normalize whitespace + quotes; pg_policies returns the parsed form.
        qual_norm  := COALESCE(regexp_replace(pol.qual, '\s+', '', 'g'), '');
        check_norm := COALESCE(regexp_replace(pol.with_check, '\s+', '', 'g'), '');

        -- Accept any of the canonical simple forms PostgreSQL emits.
        is_simple_qual := qual_norm IN (
            '(auth.role()=''service_role''::text)',
            'auth.role()=''service_role''::text',
            '(auth.role()=''service_role'')',
            'auth.role()=''service_role''',
            ''  -- empty qual is fine for INSERT-only policies
        );
        is_simple_check := check_norm IN (
            '(auth.role()=''service_role''::text)',
            'auth.role()=''service_role''::text',
            '(auth.role()=''service_role'')',
            'auth.role()=''service_role''',
            ''
        );

        IF is_simple_qual AND is_simple_check THEN
            EXECUTE format(
                'DROP POLICY %I ON %I.%I',
                pol.policyname, pol.schemaname, pol.tablename
            );
            EXECUTE format(
                'CREATE POLICY %I ON %I.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
                pol.policyname, pol.schemaname, pol.tablename
            );
            rewrites_done := rewrites_done + 1;
            RAISE NOTICE 'REWRITE  %.%: % -> TO service_role', pol.schemaname, pol.tablename, pol.policyname;
        ELSE
            rewrites_skipped := rewrites_skipped + 1;
            RAISE WARNING 'SKIP     %.%: % (compound USING/WITH CHECK; manual review needed)',
                pol.schemaname, pol.tablename, pol.policyname;
            RAISE WARNING '  USING:      %', pol.qual;
            RAISE WARNING '  WITH CHECK: %', pol.with_check;
        END IF;
    END LOOP;

    RAISE NOTICE '% policies rewritten, % skipped (manual review).', rewrites_done, rewrites_skipped;
END $$;
