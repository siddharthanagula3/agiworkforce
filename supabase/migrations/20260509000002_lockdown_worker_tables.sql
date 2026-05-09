-- =============================================================================
-- Lockdown companion to 20260509000001_worker_registrations_and_work_units.sql
-- Date: 2026-05-09
--
-- Pattern: 20260506060000_lockdown_definer_functions.sql.
--
-- Goal: assert that the RLS posture on the newly-created worker tables is
-- intentional and that the JWT-claim antipattern (`auth.role() = 'service_role'`
-- in USING/WITH CHECK) is NOT present on either table. Wave 1.5+ HIGH-1
-- forbids that pattern; this migration enforces the rule at apply time so a
-- stray hand-edited policy can't slip in unnoticed.
--
-- This migration does NOT create or revoke any function — both worker tables
-- ship without SECURITY DEFINER helpers (the api-gateway uses the service-role
-- key directly). If a future migration adds DEFINER functions over these
-- tables, a follow-up REVOKE-EXECUTE migration MUST be authored to match the
-- 20260506060000 pattern.
-- =============================================================================

DO $$
DECLARE
    bad_policy_count int;
    bad_policy record;
BEGIN
    -- Forbid the auth.role() JWT-claim antipattern on the worker tables.
    SELECT count(*) INTO bad_policy_count
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('worker_registrations', 'work_units')
      AND (
          qual LIKE '%auth.role()%service_role%'
          OR with_check LIKE '%auth.role()%service_role%'
      );

    IF bad_policy_count > 0 THEN
        FOR bad_policy IN
            SELECT tablename, policyname, qual, with_check
            FROM pg_policies
            WHERE schemaname = 'public'
              AND tablename IN ('worker_registrations', 'work_units')
              AND (
                  qual LIKE '%auth.role()%service_role%'
                  OR with_check LIKE '%auth.role()%service_role%'
              )
        LOOP
            RAISE WARNING 'JWT-claim antipattern on %.%: %  USING=%  WITH CHECK=%',
                'public', bad_policy.tablename, bad_policy.policyname,
                bad_policy.qual, bad_policy.with_check;
        END LOOP;

        RAISE EXCEPTION 'worker_registrations/work_units use auth.role()=service_role (HIGH-1). Use TO service_role role grant instead. See 20260505000003.';
    END IF;

    -- Sanity-check: both tables must have RLS enabled.
    IF NOT EXISTS (
        SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = 'worker_registrations' AND c.relrowsecurity
    ) THEN
        RAISE EXCEPTION 'worker_registrations does not have RLS enabled';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = 'work_units' AND c.relrowsecurity
    ) THEN
        RAISE EXCEPTION 'work_units does not have RLS enabled';
    END IF;

    -- Sanity-check: at least one TO service_role policy on each table.
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'worker_registrations'
          AND 'service_role' = ANY (roles)
    ) THEN
        RAISE EXCEPTION 'worker_registrations has no TO service_role policy';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'work_units'
          AND 'service_role' = ANY (roles)
    ) THEN
        RAISE EXCEPTION 'work_units has no TO service_role policy';
    END IF;

    RAISE NOTICE 'worker_registrations + work_units RLS posture verified (HIGH-1 clean).';
END $$;
