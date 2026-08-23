-- =============================================================================
-- Migration 0141: workspace control over which connectors members may use
--
-- Why    : `ConnectorPolicy` has been a designed contract in
--          packages/contracts/types/src/enterprise with no implementation.
--          "Can we stop staff connecting our CRM to this?" sits beside model
--          governance as a question every enterprise security review asks, and
--          the answer has been no.
--
-- Shape  : An allow list, a deny list, and one switch for custom connectors.
--          Custom connectors are separated because they are a different risk:
--          a catalog connector is a known integration this product ships, while
--          a custom one is an arbitrary member-supplied MCP endpoint. An
--          organization that is comfortable with the first is often not
--          comfortable with the second, and folding them together would force
--          one decision on two questions.
--
-- Empty  : AN EMPTY ALLOWLIST MEANS UNRESTRICTED, NOT DENY-ALL — the same rule
--          0076 set for the admin policy and 0139 for models. A row that
--          arrives empty must not cut every member off from every integration.
--          Restriction is something an administrator states.
--
-- Ids    : Connector ids are free text with no foreign key, for the reason 0139
--          gives about models: the catalog is generated, and a constraint would
--          block pre-blocking a connector before it ships or fail a migration
--          the day one is retired under a saved policy.
--
-- Depends: 0015 (organizations), 0037 (app_rls, current_app_user_id)
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.organization_connector_policies (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  allowed_connectors text[] NOT NULL DEFAULT ARRAY[]::text[],
  blocked_connectors text[] NOT NULL DEFAULT ARRAY[]::text[],
  -- Defaults TRUE so no existing workspace loses an integration it is already
  -- using the moment this ships.
  allow_custom_connectors boolean NOT NULL DEFAULT true,
  updated_by_user_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT connector_policy_lists_bounded CHECK (
    cardinality(allowed_connectors) <= 512 AND cardinality(blocked_connectors) <= 512
  )
);

COMMENT ON TABLE public.organization_connector_policies IS
  'Which connectors a workspace permits. Empty lists mean unrestricted; a missing row means ungoverned.';
COMMENT ON COLUMN public.organization_connector_policies.allow_custom_connectors IS
  'Custom connectors are arbitrary member-supplied MCP endpoints, a different risk from a catalog integration. Kept separate so one decision is not forced on two questions.';

DROP TRIGGER IF EXISTS set_organization_connector_policies_updated_at
  ON public.organization_connector_policies;
CREATE TRIGGER set_organization_connector_policies_updated_at
  BEFORE UPDATE ON public.organization_connector_policies
  FOR EACH ROW EXECUTE FUNCTION public.set_row_updated_at();

-- Readable by any MEMBER: their client needs the policy to explain why an
-- integration is unavailable, and hiding it produces a connector list that
-- silently omits entries with no reason given. Writable by nobody through the
-- application role — writes go through the privileged connection in a route
-- that has checked the owner/admin role, matching 0138 and 0139.
GRANT SELECT ON public.organization_connector_policies TO app_rls;

ALTER TABLE public.organization_connector_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_connector_policies FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS connector_policy_member_read ON public.organization_connector_policies;
CREATE POLICY connector_policy_member_read
  ON public.organization_connector_policies
  FOR SELECT TO app_rls
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members m
       WHERE m.organization_id = organization_connector_policies.organization_id
         AND m.user_id = public.current_app_user_id()
    )
  );

COMMIT;

-- =============================================================================
-- VERIFICATION — run MANUALLY on a throwaway Neon BRANCH before production.
-- (Commented so it never runs during apply.)
-- =============================================================================
-- -- 1. No workspace is restricted by this migration alone:
-- --    SELECT count(*) FROM public.organization_connector_policies;   -- EXPECT: 0
--
-- -- 2. A member reads their own org's policy, and nobody else's:
-- --    SET ROLE app_rls;
-- --    SET LOCAL request.jwt.claims = '{"sub":"<member>"}';
-- --    SELECT DISTINCT organization_id FROM public.organization_connector_policies;
--
-- -- 3. The application role cannot write:
-- --    INSERT INTO public.organization_connector_policies (organization_id)
-- --      VALUES ('<org>');                                  -- EXPECT: permission denied
-- =============================================================================
