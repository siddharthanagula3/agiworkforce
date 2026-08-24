-- =============================================================================
-- Migration 0139: workspace control over which models and providers may run
--
-- Why    : `ProviderPolicy` has existed as a designed contract in
--          packages/contracts/types/src/enterprise since it was written, and is
--          referenced nowhere else in the tree. "Can we restrict which models
--          our staff use?" is the first question an enterprise AI review asks,
--          and today the honest answer is no.
--
-- Shape  : Four lists, evaluated by ONE evaluator
--          (lib/services/model-policy-evaluator.ts) so the answer is identical
--          whether the request arrives from chat, a scheduled task, an agent
--          run, the CLI, or a raw API call. Precedence is specificity-ordered:
--          a named model beats a named provider, and within each level a deny
--          beats an allow.
--
-- Empty  : AN EMPTY ALLOWLIST MEANS UNRESTRICTED, NOT DENY-ALL. A row that
--          arrives empty — a fresh insert, a UI saved before anything was
--          chosen — must not lock every member out of every model. Denial is
--          something an administrator says, never something a blank field
--          implies. This mirrors the rule 0076 established for the admin policy:
--          absence is ungoverned, not governed-by-defaults.
--
-- Ids    : Model ids are stored as free text, NOT as a foreign key or a CHECK
--          against a fixed list. The catalog is generated and models come and
--          go; a constraint here would either block an administrator from
--          pre-blocking a model before it ships, or fail a migration the day a
--          model is retired out from under a saved policy. The evaluator
--          normalizes and compares, and the console renders names from the
--          catalog at read time.
--
-- Depends: 0015 (organizations), 0037 (app_rls, current_app_user_id)
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.organization_model_policies (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  allowed_providers text[] NOT NULL DEFAULT ARRAY[]::text[],
  blocked_providers text[] NOT NULL DEFAULT ARRAY[]::text[],
  allowed_models text[] NOT NULL DEFAULT ARRAY[]::text[],
  blocked_models text[] NOT NULL DEFAULT ARRAY[]::text[],
  updated_by_user_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Bounded so one workspace cannot store a list large enough to make the
  -- evaluator's linear scan a cost on every turn.
  CONSTRAINT model_policy_lists_bounded CHECK (
    cardinality(allowed_providers) <= 64
    AND cardinality(blocked_providers) <= 64
    AND cardinality(allowed_models) <= 512
    AND cardinality(blocked_models) <= 512
  )
);

COMMENT ON TABLE public.organization_model_policies IS
  'Which models and providers a workspace permits. Empty lists mean unrestricted; a missing row means ungoverned.';
COMMENT ON COLUMN public.organization_model_policies.allowed_models IS
  'When non-empty, ONLY these models may run. An entry here also overrides a blocked provider, so "no Provider X except this model" is expressible.';
COMMENT ON COLUMN public.organization_model_policies.blocked_models IS
  'Highest precedence. A model named here is refused regardless of every other list.';

DROP TRIGGER IF EXISTS set_organization_model_policies_updated_at
  ON public.organization_model_policies;
CREATE TRIGGER set_organization_model_policies_updated_at
  BEFORE UPDATE ON public.organization_model_policies
  FOR EACH ROW EXECUTE FUNCTION public.set_row_updated_at();

-- ---------------------------------------------------------------------------
-- Grants and RLS.
--
-- Readable by any MEMBER of the organization, not only its admins: a member's
-- own client needs the policy to explain why a model is unavailable, and
-- hiding it would produce a picker that silently omits models with no reason
-- given. Writable by nobody through the application role — writes go through
-- the privileged connection in a route that has checked the owner/admin role,
-- matching how legal_holds is handled in 0138.
-- ---------------------------------------------------------------------------
GRANT SELECT ON public.organization_model_policies TO app_rls;

ALTER TABLE public.organization_model_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_model_policies FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS model_policy_member_read ON public.organization_model_policies;
CREATE POLICY model_policy_member_read
  ON public.organization_model_policies
  FOR SELECT TO app_rls
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members m
       WHERE m.organization_id = organization_model_policies.organization_id
         AND m.user_id = public.current_app_user_id()
    )
  );

COMMIT;

-- =============================================================================
-- VERIFICATION — run MANUALLY on a throwaway Neon BRANCH before production.
-- Vitest mocks the adapter, so a green suite proves nothing about role or
-- policy behaviour here. (Commented so it never runs during apply.)
-- =============================================================================
-- -- 1. No organization is restricted by this migration alone:
-- --    SELECT count(*) FROM public.organization_model_policies;   -- EXPECT: 0
--
-- -- 2. A member of the org can read its policy (needed to explain a denial):
-- --    SET ROLE app_rls;
-- --    SET LOCAL request.jwt.claims = '{"sub":"<member>"}';
-- --    SELECT count(*) FROM public.organization_model_policies;   -- EXPECT: their org only
--
-- -- 3. A non-member reads nothing:
-- --    SET LOCAL request.jwt.claims = '{"sub":"<outsider>"}';
-- --    SELECT count(*) FROM public.organization_model_policies;   -- EXPECT: 0
--
-- -- 4. The application role cannot write:
-- --    SET ROLE app_rls;
-- --    INSERT INTO public.organization_model_policies (organization_id)
-- --      VALUES ('<org>');                                        -- EXPECT: permission denied
-- --    UPDATE public.organization_model_policies SET blocked_models = '{}';
-- --                                                               -- EXPECT: permission denied
--
-- -- 5. The list ceiling holds:
-- --    RESET ROLE;
-- --    UPDATE public.organization_model_policies
-- --       SET blocked_models = (SELECT array_agg('m' || g) FROM generate_series(1,513) g);
-- --                                                               -- EXPECT: check violation
-- =============================================================================
