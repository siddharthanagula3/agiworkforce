-- =============================================================================
-- Migration 0256: scoped, expiring admin delegation
--
-- Why    : the permission grid (0200, 0248) answers what a ROLE may do, and a
--          role has no end date. Handing someone billing for a quarter-end, or
--          identity for one migration, therefore meant moving them to a role
--          that keeps those permissions for ever, and nothing recorded who
--          handed it over or when it was meant to lapse.
--
-- Shape   : one row per delegation, naming the delegate, who granted it, the
--          exact permission keys it covers and the instant it stops. Revocation
--          sets revoked_at instead of deleting, because the trail has to outlive
--          the grant. A delegation never carries a Primary Owner permission:
--          those are answered by the membership row, not by a grant, and the
--          owner invariant is enforced in the route on top of this.
--
-- Empty   : No delegation is created. Every existing member keeps exactly the
--           permissions their role already gave them.
--
-- Depends : 0015 (organizations), 0037 (profiles, app_rls, current_app_user_id),
--           0200 (organization_member_permissions), 0250 (org read-policy shape)
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.organization_admin_delegations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  delegate_user_id text NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  granted_by_user_id text NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  scopes text[] NOT NULL CHECK (cardinality(scopes) BETWEEN 1 AND 32),
  reason text CHECK (reason IS NULL OR char_length(reason) <= 500),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  revoked_by_user_id text REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organization_admin_delegations_expiry_after_creation
    CHECK (expires_at > created_at),
  CONSTRAINT organization_admin_delegations_revoked_pair
    CHECK ((revoked_at IS NULL) = (revoked_by_user_id IS NULL))
);

CREATE INDEX IF NOT EXISTS idx_organization_admin_delegations_active
  ON public.organization_admin_delegations (organization_id, delegate_user_id, expires_at DESC)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_organization_admin_delegations_workspace
  ON public.organization_admin_delegations (organization_id, created_at DESC);

-- Readable by the workspace's own members so a delegate can see what they hold
-- and for how long. Written only through the privileged connection, in a route
-- that has already checked the granter's permission, as 0141 and 0144 set out.
GRANT SELECT ON public.organization_admin_delegations TO app_rls;
REVOKE INSERT, UPDATE, DELETE ON public.organization_admin_delegations FROM app_rls;

ALTER TABLE public.organization_admin_delegations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_admin_delegations FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS organization_admin_delegations_member_read
  ON public.organization_admin_delegations;
CREATE POLICY organization_admin_delegations_member_read
  ON public.organization_admin_delegations
  FOR SELECT TO app_rls
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members m
       WHERE m.organization_id = organization_admin_delegations.organization_id
         AND m.user_id = public.current_app_user_id()
    )
  );

COMMENT ON TABLE public.organization_admin_delegations IS
  'A time-boxed grant of named admin permissions to one member. Never carries a Primary Owner permission, and never lets its holder act on the last owner.';
COMMENT ON COLUMN public.organization_admin_delegations.scopes IS
  'Canonical permission keys, validated in organization-delegation.ts against the grantable set before the insert.';
COMMENT ON COLUMN public.organization_admin_delegations.revoked_at IS
  'Set instead of deleting the row: who held what, and when it stopped, has to outlive the grant.';

COMMIT;

-- =============================================================================
-- VERIFICATION - run MANUALLY on a throwaway Neon BRANCH before production.
-- =============================================================================
-- -- 1. A delegation that expires before it starts is refused:
-- --    INSERT INTO public.organization_admin_delegations
-- --      (organization_id, delegate_user_id, granted_by_user_id, scopes, expires_at)
-- --    VALUES ('<an organizations.id>', '<a profiles.id>', '<a profiles.id>',
-- --            ARRAY['admin.billing.view'], now() - interval '1 day');
-- --    EXPECT: ERROR new row violates check constraint
--
-- -- 2. An empty scope list is refused:
-- --    same INSERT with scopes = ARRAY[]::text[] and a future expiry
-- --    EXPECT: ERROR new row violates check constraint
--
-- -- 3. A revocation without an actor is refused:
-- --    UPDATE public.organization_admin_delegations SET revoked_at = now();
-- --    EXPECT: ERROR new row violates check constraint
--
-- -- 4. app_rls cannot write:
-- --    SET ROLE app_rls;
-- --    DELETE FROM public.organization_admin_delegations;
-- --    EXPECT: ERROR permission denied for table organization_admin_delegations
-- --    RESET ROLE;
-- =============================================================================
