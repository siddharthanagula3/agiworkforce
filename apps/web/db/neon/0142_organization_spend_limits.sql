-- =============================================================================
-- Migration 0142: let a workspace cap what it spends
--
-- Why    : `/workspace/usage` reports what a workspace consumed and closes by
--          admitting it cannot stop it consuming more. A finance owner asked to
--          approve an AI budget wants the second thing, not the first.
--
-- Three modes, because "cap" means different things to different buyers:
--          off    — recorded, nothing acts on it
--          notify — the cap is crossed, work continues, the crossing is audited
--          block  — managed turns are refused once the cap is reached
--
--          `notify` is the default for a newly created limit and `off` is the
--          column default, so a workspace that saves a number without choosing
--          a mode does not silently start refusing its members' work. Blocking
--          is the one mode that stops people working, and it must be chosen.
--
-- Window : Calendar month, from date_trunc('month', now()) in UTC. Not a
--          rolling 30 days: a budget is reconciled against an invoice, and an
--          invoice has a month boundary. A rolling window would report a number
--          finance cannot tie to anything.
--
-- Honest : Enforcement is EVENTUAL, not exact. Summing month-to-date spend on
--          every turn would put an aggregate scan on the hot path, so the
--          decision is cached briefly and a workspace can overshoot its cap by
--          roughly one cache window of spend. The console says so in those
--          words. A cap presented as exact when it is not is the same class of
--          lie as a retention window nothing sweeps.
--
-- Depends: 0015 (organizations), 0037 (app_rls), 0056 (managed_usage_requests)
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.organization_spend_limits (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  monthly_cap_cents integer NOT NULL CHECK (monthly_cap_cents > 0),
  enforcement text NOT NULL DEFAULT 'off'
    CHECK (enforcement IN ('off', 'notify', 'block')),
  alert_threshold_pct integer NOT NULL DEFAULT 80
    CHECK (alert_threshold_pct BETWEEN 1 AND 100),
  updated_by_user_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN public.organization_spend_limits.enforcement IS
  'off = recorded only; notify = crossing is audited and work continues; block = managed turns refused once the cap is reached. Blocking stops people working, so it is never a default.';
COMMENT ON COLUMN public.organization_spend_limits.monthly_cap_cents IS
  'Calendar-month ceiling in cents, matched to the invoice period. Enforcement is eventual, not exact: the decision is cached briefly, so a workspace can overshoot by roughly one cache window of spend.';

DROP TRIGGER IF EXISTS set_organization_spend_limits_updated_at
  ON public.organization_spend_limits;
CREATE TRIGGER set_organization_spend_limits_updated_at
  BEFORE UPDATE ON public.organization_spend_limits
  FOR EACH ROW EXECUTE FUNCTION public.set_row_updated_at();

-- The month-to-date sum runs on every governed turn. Without this it degrades
-- to a scan of every managed request the workspace has ever made.
--
-- APPLY NOTE: this indexes a HOT table. The migration runner wraps each file in
-- a transaction with `lock_timeout = 10s` and `statement_timeout = 120s`, so a
-- contended build fails the deploy loudly rather than holding writes open — but
-- once the lock is taken the build can block writes to this table for up to two
-- minutes. On a large table, apply during a quiet window. `CONCURRENTLY` is not
-- available here because it cannot run inside the runner's transaction.
CREATE INDEX IF NOT EXISTS idx_managed_usage_requests_org_month
  ON public.managed_usage_requests (organization_id, created_at)
  WHERE organization_id IS NOT NULL AND status = 'completed';

-- Readable by any member: a member refused a turn is entitled to know the
-- reason is a workspace budget rather than a fault. Writable by nobody through
-- the application role, matching 0138/0139/0141.
GRANT SELECT ON public.organization_spend_limits TO app_rls;

ALTER TABLE public.organization_spend_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_spend_limits FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS spend_limits_member_read ON public.organization_spend_limits;
CREATE POLICY spend_limits_member_read
  ON public.organization_spend_limits
  FOR SELECT TO app_rls
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members m
       WHERE m.organization_id = organization_spend_limits.organization_id
         AND m.user_id = public.current_app_user_id()
    )
  );

COMMIT;

-- =============================================================================
-- VERIFICATION — run MANUALLY on a throwaway Neon BRANCH before production.
-- (Commented so it never runs during apply.)
-- =============================================================================
-- -- 1. No workspace is capped by this migration alone:
-- --    SELECT count(*) FROM public.organization_spend_limits;   -- EXPECT: 0
--
-- -- 2. A cap of zero or less is impossible, so "capped at nothing" cannot be
-- --    saved by accident and refuse every turn:
-- --    INSERT INTO public.organization_spend_limits (organization_id, monthly_cap_cents)
-- --      VALUES ('<org>', 0);                                   -- EXPECT: check violation
--
-- -- 3. The application role cannot write:
-- --    SET ROLE app_rls;
-- --    UPDATE public.organization_spend_limits SET monthly_cap_cents = 999999;
-- --                                                             -- EXPECT: permission denied
--
-- -- 4. The month index is used rather than a sequential scan:
-- --    EXPLAIN SELECT sum(actual_cost_cents) FROM public.managed_usage_requests
-- --     WHERE organization_id = '<org>' AND status = 'completed'
-- --       AND created_at >= date_trunc('month', now());
-- --    EXPECT: Index Scan using idx_managed_usage_requests_org_month.
-- =============================================================================
