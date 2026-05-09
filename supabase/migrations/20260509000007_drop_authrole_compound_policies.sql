-- =============================================================================
-- HIGH-1 follow-up: drop redundant auth.role()='service_role' qual on the
-- 2 policies the original sweep skipped
-- Date: 2026-05-09
-- Wave: 5.9
-- Source: tasks/research/EXECUTION_PLAN_2026-05-09.md (Wave 5.9 hardening)
--          tasks/research/exec/w54-timestamp-reconcile-report.md §3.3 + §9.1
--          docs/security/red-team-2026-05-04.md HIGH-1
--
-- Background: 20260505000003_replace_authrole_with_role_grant.sql (applied
-- to prod as 20260506025937) iterated pg_policies and rewrote every policy
-- whose qual/with_check exactly matched `(auth.role()='service_role'::text)`
-- (or its bare/parens variants) into `TO service_role USING (true) WITH CHECK
-- (true)`. Policies whose qual contained that test embedded in something
-- larger were SKIPPED with a WARNING (the migration's `is_simple_qual` /
-- `is_simple_check` regex match).
--
-- Verified 2026-05-09 via mcp__supabase__execute_sql: 2 policies still match
-- the antipattern in prod:
--
--   public.beta_invites    "Service role can manage invites"
--   public.waitlist        "Service role can manage waitlist"
--
-- Both are FOR ALL TO service_role with qual + with_check = `(( SELECT
-- auth.role() AS role) = 'service_role'::text)`. The SELECT subquery wrapper
-- is what defeated the original sweep's regex. Functionally these policies
-- are NOT compound — there's no AND/OR/NOT, just a SELECT subquery binding —
-- but they do trust the JWT-claim role.
--
-- Threat: a JWT signed with the project's SUPABASE_JWT_SECRET (which any
-- backend service holds) and `role:'service_role'` claim would satisfy both
-- the TO clause AND the auth.role() check, granting full RLS bypass against
-- these two tables. Revoking the auth.role() qual closes the JWT-claim path;
-- the connection role (set by SET ROLE in the auth proxy when the actual
-- service-role API KEY is presented as the bearer) becomes the sole gate.
--
-- Approach: ALTER POLICY in-place. We deliberately do NOT DROP+CREATE because
-- both tables have data (1 row each verified 2026-05-09) and a brief window
-- without the policy could either let a transaction sneak through or block
-- a legitimate service-role write depending on PG's policy-resolution timing.
--
-- The TO service_role role grant is left intact. After this migration:
--
--   USING / WITH CHECK on both = true
--   roles                      = {service_role}   (unchanged)
--
-- Net behaviour: only connections SET ROLE'd to service_role can READ/WRITE;
-- a JWT-claim minted with role='service_role' but presented over the
-- authenticated connection (which lacks SET ROLE service_role) is denied.
--
-- == Verification post-apply ==
--
--   SELECT count(*) FROM pg_policies
--    WHERE qual LIKE '%auth.role()%service_role%'
--       OR with_check LIKE '%auth.role()%service_role%';
--   -- expected: 0
-- =============================================================================

DO $$
DECLARE
    target record;
    targets text[] := ARRAY[
        'public|beta_invites|Service role can manage invites',
        'public|waitlist|Service role can manage waitlist'
    ];
    spec text;
    parts text[];
    matched int := 0;
    cleaned int := 0;
BEGIN
    FOREACH spec IN ARRAY targets LOOP
        parts := string_to_array(spec, '|');

        SELECT schemaname, tablename, policyname, qual, with_check
          INTO target
        FROM pg_policies
        WHERE schemaname = parts[1]
          AND tablename  = parts[2]
          AND policyname = parts[3];

        IF NOT FOUND THEN
            RAISE NOTICE 'SKIP %.%: % (policy not present in this environment)',
                parts[1], parts[2], parts[3];
            CONTINUE;
        END IF;

        matched := matched + 1;

        -- Refuse to touch a policy whose qual is anything other than the
        -- known antipattern. Compound policies with AND/OR alongside the
        -- auth.role() check require human review — the sweep migration
        -- already chose not to rewrite them. This is defence-in-depth so
        -- a future hand-edit doesn't accidentally widen RLS.
        IF target.qual !~ '^[\s\(]*\(\s*SELECT\s+auth\.role\(\)\s+AS\s+role\s*\)\s*=\s*''service_role''::text\s*[\)\s]*$'
           OR target.with_check !~ '^[\s\(]*\(\s*SELECT\s+auth\.role\(\)\s+AS\s+role\s*\)\s*=\s*''service_role''::text\s*[\)\s]*$'
        THEN
            RAISE WARNING 'REFUSE %.%: % — qual/with_check no longer matches the known antipattern; manual review required.',
                parts[1], parts[2], parts[3];
            RAISE WARNING '   qual:       %', target.qual;
            RAISE WARNING '   with_check: %', target.with_check;
            CONTINUE;
        END IF;

        EXECUTE format(
            'ALTER POLICY %I ON %I.%I USING (true) WITH CHECK (true)',
            target.policyname, target.schemaname, target.tablename
        );
        cleaned := cleaned + 1;
        RAISE NOTICE 'CLEANED %.%: % — auth.role() qual replaced with true; TO service_role role grant retained',
            target.schemaname, target.tablename, target.policyname;
    END LOOP;

    RAISE NOTICE 'HIGH-1 follow-up sweep: % policies matched, % cleaned.', matched, cleaned;
END $$;

-- Final assertion: zero remaining auth.role()='service_role' usages anywhere.
DO $$
DECLARE
    remaining int;
BEGIN
    SELECT count(*) INTO remaining FROM pg_policies
     WHERE qual LIKE '%auth.role()%service_role%'
        OR with_check LIKE '%auth.role()%service_role%';

    IF remaining > 0 THEN
        RAISE EXCEPTION 'HIGH-1 not fully resolved: % policies still trust auth.role()=service_role. Hand-fix required before re-run.', remaining;
    END IF;
    RAISE NOTICE 'HIGH-1 sweep complete: 0 auth.role()=service_role qual/with_check remain in pg_policies.';
END $$;
