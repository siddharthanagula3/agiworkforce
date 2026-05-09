-- =============================================================================
-- Lockdown companion to 20260509000003_rotate_dispatch_keys_rpc.sql
-- Date: 2026-05-09
--
-- Pattern: 20260506060000_lockdown_definer_functions.sql.
--
-- 1. Re-assert SECURITY DEFINER EXECUTE grants on rotate_dispatch_keys.
--    Direct anon/PUBLIC calls are denied; authenticated users can call
--    only for their own device_id (enforced inside the function body).
-- 2. Verify dispatch_keys RLS posture matches the role-grant pattern
--    (TO service_role, TO authenticated — never auth.role() = 'service_role').
-- 3. Verify rotate_dispatch_keys has SET search_path (function_search_path_mutable
--    advisor — see 20260506060001_fix_function_search_path_wave3.sql).
-- =============================================================================

-- Idempotent re-grant — the previous migration already does this, but
-- re-running here means a hand-edit between the two migrations cannot quietly
-- broaden access. REVOKE first, then re-grant the small allow-list.
REVOKE ALL ON FUNCTION public.rotate_dispatch_keys(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rotate_dispatch_keys(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.rotate_dispatch_keys(uuid) TO authenticated;

DO $$
DECLARE
    bad_rls record;
    has_search_path boolean;
BEGIN
    -- Forbid the JWT-claim antipattern on dispatch_keys.
    IF EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'dispatch_keys'
          AND (
              qual LIKE '%auth.role()%service_role%'
              OR with_check LIKE '%auth.role()%service_role%'
          )
    ) THEN
        FOR bad_rls IN
            SELECT policyname, qual, with_check FROM pg_policies
            WHERE schemaname = 'public' AND tablename = 'dispatch_keys'
              AND (qual LIKE '%auth.role()%service_role%'
                   OR with_check LIKE '%auth.role()%service_role%')
        LOOP
            RAISE WARNING 'JWT-claim antipattern on dispatch_keys: %  USING=%  WITH CHECK=%',
                bad_rls.policyname, bad_rls.qual, bad_rls.with_check;
        END LOOP;
        RAISE EXCEPTION 'dispatch_keys uses auth.role()=service_role (HIGH-1). Use TO service_role.';
    END IF;

    -- RLS must be enabled.
    IF NOT EXISTS (
        SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = 'dispatch_keys' AND c.relrowsecurity
    ) THEN
        RAISE EXCEPTION 'dispatch_keys does not have RLS enabled';
    END IF;

    -- search_path must be pinned on the SECURITY DEFINER RPC. PG stores the
    -- proconfig entry as e.g. 'search_path=public, pg_temp' or
    -- 'search_path=public,pg_temp' depending on how the SET clause was
    -- parsed; we accept any non-empty pin via prefix match on each entry.
    SELECT EXISTS (
        SELECT 1
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = 'rotate_dispatch_keys'
          AND p.proconfig IS NOT NULL
          AND EXISTS (
              SELECT 1 FROM unnest(p.proconfig) AS cfg
              WHERE cfg LIKE 'search_path=%'
          )
    ) INTO has_search_path;

    IF NOT has_search_path THEN
        RAISE EXCEPTION 'rotate_dispatch_keys SECURITY DEFINER function lacks SET search_path = public, pg_temp';
    END IF;

    RAISE NOTICE 'dispatch_keys RLS + rotate_dispatch_keys SECURITY DEFINER posture verified.';
END $$;
