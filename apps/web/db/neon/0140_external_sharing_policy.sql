-- =============================================================================
-- Migration 0140: let a workspace switch off public sharing
--
-- Why    : "Can we stop staff publishing our conversations to a public URL?" is
--          a standard question in an enterprise security review, and today the
--          answer is no. Two routes mint anonymous public links —
--          /api/share (a chat transcript) and /api/artifacts/publish (a
--          generated artifact) — and neither asks the workspace anything.
--
-- Shape  : One boolean, defaulting TRUE. Every existing workspace keeps the
--          behaviour it has today; switching sharing off is a decision an
--          administrator makes, not one a migration makes for them. That is the
--          same direction 0138 took with retention, for the same reason: a
--          migration that silently changes what members can do is indefensible
--          however defensible the new default is.
--
-- Two states, not three
--        : Reference products offer "allowed / approved domains only /
--          disabled". The middle state is NOT offered here and must not be
--          added as a checkbox: a public share link is anonymous — there is no
--          recipient identity at fetch time to check a domain against — so a
--          domain rule would be a control that decides nothing. If domain
--          scoping is ever wanted it needs authenticated recipients first,
--          which is a different feature.
--
-- Depends: 0076_enterprise_control_plane_tables (organization_admin_policies)
-- =============================================================================

BEGIN;

ALTER TABLE public.organization_admin_policies
  ADD COLUMN IF NOT EXISTS external_sharing_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.organization_admin_policies.external_sharing_enabled IS
  'When false, members of this workspace cannot mint anonymous public links (chat shares or published artifacts). Existing links are unaffected; revoking them is a separate action.';

COMMIT;

-- =============================================================================
-- VERIFICATION — run MANUALLY on a throwaway Neon BRANCH before production.
-- (Commented so it never runs during apply.)
-- =============================================================================
-- -- 1. No workspace loses sharing as a side effect of this migration:
-- --    SELECT count(*) FROM public.organization_admin_policies
-- --     WHERE external_sharing_enabled = false;      -- EXPECT: 0
--
-- -- 2. The column is readable by the application role through the existing
-- --    policy on organization_admin_policies (0076 already grants it):
-- --    SET ROLE app_rls;
-- --    SET LOCAL request.jwt.claims = '{"sub":"<member>"}';
-- --    SELECT external_sharing_enabled FROM public.organization_admin_policies;
-- =============================================================================
