-- =============================================================================
-- Migration 0138: make retention a control instead of a stated position
--
-- Why    : `organization_admin_policies.retention_days` has been stored since
--          0076 and read by nothing. The workspace console labels it a "stated
--          position" for exactly that reason (ORGPOLICY-03). A retention number
--          a buyer's compliance officer cannot evidence is worse than no
--          number, because it reads as deletion that is not happening.
--
-- Shape  : Three parts, and the ordering between them is the safety property.
--
--          1. `retention_enforced` — OPT-IN, defaults false. Turning retention
--             on deletes conversations permanently, so it must be a decision an
--             owner makes deliberately for their own workspace. Every existing
--             organization keeps today's behaviour (nothing is swept) until
--             someone explicitly says otherwise. A migration must never begin
--             deleting customer data as a side effect of shipping.
--
--          2. `legal_holds` — a hold SUSPENDS retention for its subject. Scope
--             is either the whole organization or one member. A held subject's
--             rows survive the sweep no matter how old they are.
--
--          3. `organization_retention_sweeps` — the evidence record. What ran,
--             what it deleted, what it skipped because of a hold, and whether
--             it completed. Without this a customer can only be told that
--             deletion happens; with it they can be shown that it did.
--
-- Safety : The sweep is required to fail closed. If the hold set cannot be
--          read, nothing is deleted — a false negative costs a day of
--          retention, a false positive destroys evidence under legal hold and
--          cannot be undone. That rule lives in the service; this file gives it
--          the tables to enforce it against, and records a failed sweep rather
--          than leaving silence.
--
-- Depends: 0076_enterprise_control_plane_tables (organization_admin_policies)
--          0037_rls_user_isolation             (app_rls, current_app_user_id)
--          0073_tenancy_foundation             (organizations, org membership)
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Retention becomes something a workspace turns on.
-- ---------------------------------------------------------------------------
ALTER TABLE public.organization_admin_policies
  ADD COLUMN IF NOT EXISTS retention_enforced boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.organization_admin_policies.retention_enforced IS
  'When false, retention_days is a recorded position and nothing is deleted. When true, the retention sweep permanently deletes workspace conversations past retention_days of inactivity, except those under legal hold.';

-- ---------------------------------------------------------------------------
-- 2. Legal holds.
--
-- `released_at` rather than a delete: the history of a hold is itself evidence,
-- and a hold that can vanish without trace is not a hold. The partial unique
-- index stops the same subject being held twice concurrently, which would make
-- "release the hold" ambiguous.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.legal_holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  reason text CHECK (reason IS NULL OR char_length(reason) <= 2000),
  scope text NOT NULL CHECK (scope IN ('organization', 'member')),
  subject_user_id text,
  created_by_user_id text NOT NULL,
  released_at timestamptz,
  released_by_user_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- A member-scoped hold without a subject would silently hold nothing, and an
  -- organization-scoped hold with one would read as narrower than it is.
  CONSTRAINT legal_holds_subject_matches_scope CHECK (
    (scope = 'member' AND subject_user_id IS NOT NULL)
    OR (scope = 'organization' AND subject_user_id IS NULL)
  ),
  CONSTRAINT legal_holds_release_has_actor CHECK (
    released_at IS NULL OR released_by_user_id IS NOT NULL
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_legal_holds_active_org
  ON public.legal_holds (organization_id)
  WHERE released_at IS NULL AND scope = 'organization';

CREATE UNIQUE INDEX IF NOT EXISTS idx_legal_holds_active_member
  ON public.legal_holds (organization_id, subject_user_id)
  WHERE released_at IS NULL AND scope = 'member';

CREATE INDEX IF NOT EXISTS idx_legal_holds_org_created
  ON public.legal_holds (organization_id, created_at DESC);

DROP TRIGGER IF EXISTS set_legal_holds_updated_at ON public.legal_holds;
CREATE TRIGGER set_legal_holds_updated_at
  BEFORE UPDATE ON public.legal_holds
  FOR EACH ROW EXECUTE FUNCTION public.set_row_updated_at();

-- ---------------------------------------------------------------------------
-- 3. Sweep evidence.
--
-- `outcome` distinguishes the three endings that matter to an auditor: the
-- sweep ran, the sweep declined to run because holds could not be established,
-- and the sweep failed partway. Collapsing the last two into "error" would hide
-- the case where the system correctly refused to delete.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organization_retention_sweeps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  retention_days integer NOT NULL CHECK (retention_days BETWEEN 1 AND 3650),
  cutoff timestamptz NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('deleted', 'nothing_due', 'held', 'aborted', 'failed')),
  conversations_deleted integer NOT NULL DEFAULT 0 CHECK (conversations_deleted >= 0),
  conversations_held integer NOT NULL DEFAULT 0 CHECK (conversations_held >= 0),
  active_holds integer NOT NULL DEFAULT 0 CHECK (active_holds >= 0),
  dry_run boolean NOT NULL DEFAULT false,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT retention_sweeps_failure_has_reason CHECK (
    outcome NOT IN ('aborted', 'failed') OR error IS NOT NULL
  ),
  -- A dry run reports what it WOULD delete. Recording a deletion count against
  -- a dry run and a real sweep identically would make the evidence useless.
  CONSTRAINT retention_sweeps_dry_run_deletes_nothing CHECK (
    dry_run = false OR conversations_deleted = 0
  )
);

CREATE INDEX IF NOT EXISTS idx_retention_sweeps_org_created
  ON public.organization_retention_sweeps (organization_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Grants and RLS, mirroring 0076's admin surface.
--
-- Both tables are readable by owners and admins of the organization they
-- describe. Neither is writable from the application role: a hold that the org
-- under investigation can delete is not a hold, and a sweep record it can edit
-- is not evidence. Writes go through the privileged owner connection in a
-- route that has already checked the role.
-- ---------------------------------------------------------------------------
GRANT SELECT ON public.legal_holds TO app_rls;
GRANT SELECT ON public.organization_retention_sweeps TO app_rls;

ALTER TABLE public.legal_holds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legal_holds FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS legal_holds_admin_read ON public.legal_holds;
CREATE POLICY legal_holds_admin_read
  ON public.legal_holds
  FOR SELECT TO app_rls
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members m
       WHERE m.organization_id = legal_holds.organization_id
         AND m.user_id = public.current_app_user_id()
         AND m.role IN ('owner', 'admin')
    )
  );

ALTER TABLE public.organization_retention_sweeps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_retention_sweeps FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS retention_sweeps_admin_read ON public.organization_retention_sweeps;
CREATE POLICY retention_sweeps_admin_read
  ON public.organization_retention_sweeps
  FOR SELECT TO app_rls
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members m
       WHERE m.organization_id = organization_retention_sweeps.organization_id
         AND m.user_id = public.current_app_user_id()
         AND m.role IN ('owner', 'admin')
    )
  );

-- The sweep filters conversations by organization and last activity. Without
-- this it degrades to a sequential scan of every conversation in the system
-- once per organization per night.
CREATE INDEX IF NOT EXISTS idx_web_conversations_org_updated
  ON public.web_conversations (organization_id, updated_at)
  WHERE organization_id IS NOT NULL;

COMMIT;

-- =============================================================================
-- VERIFICATION — run MANUALLY on a throwaway Neon BRANCH before production.
-- Vitest mocks the adapter, so a green suite proves nothing about role or
-- policy behaviour here. (Commented so it never runs during apply.)
-- =============================================================================
-- -- 1. No existing organization starts deleting anything:
-- --    SELECT count(*) FROM public.organization_admin_policies WHERE retention_enforced;
-- --    EXPECT: 0.
--
-- -- 2. A member cannot read another org's holds, and cannot read their own:
-- --    SET ROLE app_rls;
-- --    SET LOCAL request.jwt.claims = '{"sub":"<plain-member>"}';
-- --    SELECT count(*) FROM public.legal_holds;   -- EXPECT: 0
--
-- -- 3. An admin reads only their own organization's holds:
-- --    SET LOCAL request.jwt.claims = '{"sub":"<org-admin>"}';
-- --    SELECT DISTINCT organization_id FROM public.legal_holds;  -- EXPECT: one org
--
-- -- 4. The application role cannot write either table:
-- --    SET ROLE app_rls;
-- --    INSERT INTO public.legal_holds (organization_id, name, scope, created_by_user_id)
-- --      VALUES ('<org>', 'x', 'organization', 'u');  -- EXPECT: permission denied
-- --    UPDATE public.organization_retention_sweeps SET conversations_deleted = 0;
-- --                                                  -- EXPECT: permission denied
--
-- -- 5. A subject cannot be held twice concurrently:
-- --    RESET ROLE;
-- --    INSERT ... scope 'organization' twice for one org  -- EXPECT: unique violation
-- =============================================================================
