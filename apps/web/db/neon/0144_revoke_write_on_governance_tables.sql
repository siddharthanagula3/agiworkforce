-- =============================================================================
-- Migration 0144: revoke the writes 0037 hands out automatically
--
-- Why    : 0037 ran `ALTER DEFAULT PRIVILEGES ... GRANT SELECT, INSERT, UPDATE,
--          DELETE ON TABLES TO app_rls`, so EVERY table created since inherits
--          full DML for the application role. 0138-0143 each said "writable by
--          nobody through the application role" and each wrote `GRANT SELECT`,
--          which is additive — it granted nothing new and revoked nothing.
--
--          Found by applying the whole chain to a real Postgres and reading
--          `information_schema.role_table_grants`. All six came back
--          `DELETE,INSERT,SELECT,UPDATE`. Text review had passed them.
--
-- Was it exploitable
--        : Not today. Each table carries a `FOR SELECT` policy and no
--          permissive policy for the write verbs, so with RLS forced an INSERT
--          is refused and an UPDATE or DELETE matches zero rows. The protection
--          was real but accidental: it rested on a policy NOT existing rather
--          than on a privilege not being held, so anyone later adding a
--          `FOR ALL` policy for a legitimate read reason would silently hand
--          over write access to legal holds, retention evidence, spend caps,
--          and SIEM configuration.
--
-- Shape  : Explicit REVOKE, the same thing 0087 did for enterprise_audit_events
--          once the same problem was noticed there. Belt and braces: the policy
--          keeps failing closed, and the grant no longer contradicts the
--          comment above it.
--
-- Depends: 0037, 0138, 0139, 0141, 0142, 0143
-- =============================================================================

BEGIN;

DO $$
DECLARE
  t text;
  governance_tables text[] := ARRAY[
    'legal_holds',
    'organization_retention_sweeps',
    'organization_model_policies',
    'organization_connector_policies',
    'organization_spend_limits',
    'organization_audit_destinations'
  ];
BEGIN
  FOREACH t IN ARRAY governance_tables LOOP
    IF to_regclass(format('public.%I', t)) IS NULL THEN
      RAISE NOTICE '0144: skipping %, relation not present', t;
      CONTINUE;
    END IF;
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON public.%I FROM app_rls', t);
    EXECUTE format('GRANT SELECT ON public.%I TO app_rls', t);
  END LOOP;
END $$;

COMMIT;

-- =============================================================================
-- VERIFICATION — run MANUALLY on a throwaway Neon BRANCH before production.
-- This block was written AFTER being run: the expectations are what a real
-- Postgres returned, not what the author hoped it would.
-- =============================================================================
-- -- 1. Only SELECT survives on every governance table:
-- --    SELECT table_name, string_agg(privilege_type, ',' ORDER BY privilege_type)
-- --      FROM information_schema.role_table_grants
-- --     WHERE grantee = 'app_rls'
-- --       AND table_name IN ('legal_holds','organization_retention_sweeps',
-- --                          'organization_model_policies','organization_connector_policies',
-- --                          'organization_spend_limits','organization_audit_destinations')
-- --     GROUP BY table_name;
-- --    EXPECT: SELECT for all six. Before this migration: DELETE,INSERT,SELECT,UPDATE.
--
-- -- 2. A write is refused on privilege now, not merely matched to zero rows:
-- --    SET ROLE app_rls;
-- --    SET LOCAL request.jwt.claim.sub = '<an-org-admin>';
-- --    UPDATE public.organization_spend_limits SET monthly_cap_cents = 1;
-- --    EXPECT: ERROR permission denied for table organization_spend_limits.
--
-- -- 3. Reads still work for the roles each policy admits:
-- --    SELECT count(*) FROM public.organization_model_policies;  -- EXPECT: their org's row
-- =============================================================================
