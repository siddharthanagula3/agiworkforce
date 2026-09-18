-- =============================================================================
-- Migration 0266: a durable receipt for every browser, computer-use and
--                 remote-control action
--
-- Why    : 0143 streams audit events to a customer SIEM, but nothing browser or
--          computer-use shaped ever reached that stream, and the outcome route
--          added with the automation pipeline emitted metrics and one log line
--          per run and then forgot. A run that clicked through somebody's
--          signed-in session left no row anyone could query afterwards: not the
--          person, not support, not a security reviewer.
--
-- What   : one row per action, naming who asked, from which device, against
--          which site or app, what was asked for, and how it ended. The
--          enterprise stream keeps getting one roll-up per RUN (via
--          `record_enterprise_audit_event`, 0076/0143) because a SIEM wants the
--          episode, not every pointer move; this table is where the per-action
--          detail lives.
--
-- Success: a `succeeded` row must carry a check that passed. The application
--          settles that (a claim with no passing check settles as `failed`),
--          and the constraint here means a direct writer cannot get around it
--          either. `verified` is therefore not a field anyone may simply set.
--
-- Content: `target` is an origin or a bundle id and `reason` is capped free
--          text. Page content, typed text and screenshots never come here;
--          the application clamps both before the insert.
--
-- Tenancy: user_id on every row with RLS, plus an optional organization_id so a
--          workspace can read what ran under it. A row with no organization is
--          personal and only its owner sees it.
--
-- Depends: 0015 (organizations), 0037 (app_rls), 0076 (enterprise audit)
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.automation_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  run_id text NOT NULL CHECK (char_length(run_id) BETWEEN 1 AND 128),
  device_id text CHECK (device_id IS NULL OR char_length(device_id) BETWEEN 1 AND 128),
  surface text NOT NULL CHECK (surface IN ('extension', 'desktop', 'cloud')),
  action text NOT NULL CHECK (char_length(action) BETWEEN 1 AND 120),
  target text CHECK (target IS NULL OR char_length(target) <= 300),
  session_kind text CHECK (session_kind IS NULL OR session_kind IN ('user-chrome', 'built-in', 'cloud')),
  profile_id text CHECK (profile_id IS NULL OR char_length(profile_id) <= 128),
  status text NOT NULL CHECK (status IN ('attempted', 'succeeded', 'refused', 'failed')),
  reason text NOT NULL CHECK (char_length(reason) <= 300),
  verified boolean NOT NULL DEFAULT false,
  verification_check text CHECK (verification_check IS NULL OR char_length(verification_check) <= 300),
  verification_passed boolean,
  started_at timestamptz NOT NULL,
  settled_at timestamptz NOT NULL,
  duration_ms integer NOT NULL CHECK (duration_ms >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  -- A verification is a pair. Half of one is a claim with nothing behind it.
  CONSTRAINT automation_audit_verification_is_whole CHECK (
    (verification_check IS NULL) = (verification_passed IS NULL)
  ),
  -- Verified means a check ran and passed, and a success means verified. Both
  -- directions, so neither the flag nor the status can be set on its own.
  CONSTRAINT automation_audit_verified_needs_a_passing_check CHECK (
    verified = false OR verification_passed = true
  ),
  CONSTRAINT automation_audit_success_is_verified CHECK (
    status <> 'succeeded' OR verified = true
  ),
  CONSTRAINT automation_audit_settles_after_it_starts CHECK (settled_at >= started_at)
);

COMMENT ON TABLE public.automation_audit_events IS
  'One row per browser, computer-use or remote-control action: who, which device, which site or app, what, and how it ended. Queryable after the run that produced it is gone.';
COMMENT ON COLUMN public.automation_audit_events.target IS
  'The origin or app bundle the action was aimed at. Never a URL path, a query string or page content.';
COMMENT ON COLUMN public.automation_audit_events.verified IS
  'True only when a post-action check ran and passed. A success claim with no passing check is stored as failed.';
COMMENT ON COLUMN public.automation_audit_events.profile_id IS
  'The browser permission profile, or the app permission, that admitted this action.';

CREATE INDEX IF NOT EXISTS automation_audit_events_user_created_idx
  ON public.automation_audit_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS automation_audit_events_run_idx
  ON public.automation_audit_events (user_id, run_id, started_at);
CREATE INDEX IF NOT EXISTS automation_audit_events_org_created_idx
  ON public.automation_audit_events (organization_id, created_at DESC)
  WHERE organization_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS automation_audit_events_device_created_idx
  ON public.automation_audit_events (user_id, device_id, created_at DESC)
  WHERE device_id IS NOT NULL;

ALTER TABLE public.automation_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_audit_events FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS automation_audit_events_user_isolation
  ON public.automation_audit_events;
CREATE POLICY automation_audit_events_user_isolation
  ON public.automation_audit_events
  USING (user_id = public.current_app_user_id())
  WITH CHECK (user_id = public.current_app_user_id());

REVOKE ALL ON public.automation_audit_events FROM public;
GRANT SELECT, INSERT ON public.automation_audit_events TO app_rls;

COMMIT;

-- =============================================================================
-- VERIFICATION — run MANUALLY on a throwaway Neon BRANCH before production.
-- (Commented so it never runs during apply.)
-- =============================================================================
-- -- 1. The table starts empty and nothing is backfilled:
-- --    SELECT count(*) FROM public.automation_audit_events;        -- EXPECT: 0
--
-- -- 2. A success with no passing check cannot be stored:
-- --    INSERT INTO public.automation_audit_events
-- --      (user_id, run_id, surface, action, status, reason, verified,
-- --       started_at, settled_at, duration_ms)
-- --      VALUES ('<user>', 'run_1', 'desktop', 'click', 'succeeded',
-- --              'looked fine', false, now(), now(), 0);
-- --                                                      -- EXPECT: check violation
--
-- -- 3. Half a verification cannot be stored:
-- --    INSERT INTO public.automation_audit_events
-- --      (user_id, run_id, surface, action, status, reason, verification_check,
-- --       started_at, settled_at, duration_ms)
-- --      VALUES ('<user>', 'run_1', 'desktop', 'click', 'failed', 'no',
-- --              'the cart shows one item', now(), now(), 0);
-- --                                                      -- EXPECT: check violation
--
-- -- 4. Another tenant cannot read a row:
-- --    SET ROLE app_rls;
-- --    SELECT set_config('request.jwt.claim.sub', '<other-user>', true);
-- --    SELECT count(*) FROM public.automation_audit_events;        -- EXPECT: 0
