-- =============================================================================
-- Migration 0258: give a Managed Cloud run the safety envelope the CLI already has
--
-- Why    : apps/cli/src/cost_ledger.rs caps what one CLI session may spend and
--          crates/agiworkforce-agent-core/src/runaway.rs stops it looping. The
--          cloud Work runtime had neither: 0125 meters a run AFTER it settles,
--          so a run that loops on one tool or spends without end is only ever
--          discovered on the invoice. Two engines, two different promises.
--
-- What   : one row per run holding the envelope that run is allowed: spend,
--          tool calls, wall clock, and its place in the subagent tree. Every
--          provider and tool operation is authorised against it before the
--          side effect happens, and the refusal that stops a run is recorded
--          here so the reason survives the process that decided it.
--
-- Spend  : micro-USD, matching the managed usage ledger. NULL means no cap,
--          which is what a run created before this migration effectively had;
--          the service supplies a default so new runs are never uncapped.
--
-- Subtree: `depth` is 0 for a run a person started and parent_run_id is NULL
--          for exactly those runs, so the tree cannot be malformed. A child is
--          capped at its even share of what the parent has left, so a fan-out
--          cannot together outspend the run that delegated it. `delegation_key`
--          names the delegation rather than the attempt: a retried child is a
--          second row under the same key and does not consume a second slot.
--
-- Tenancy: both foreign keys carry user_id, so a run can neither budget nor
--          parent another person's run.
--
-- Depends: 0061 (cloud_agent_runs), 0063 (cloud_agent_execution_operations)
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.cloud_agent_run_budgets (
  run_id uuid PRIMARY KEY,
  user_id text NOT NULL,
  parent_run_id uuid,
  delegation_key text CHECK (delegation_key IS NULL OR length(delegation_key) BETWEEN 1 AND 255),
  depth integer NOT NULL DEFAULT 0 CHECK (depth >= 0),
  attempt integer NOT NULL DEFAULT 1 CHECK (attempt > 0),
  max_cost_microusd bigint CHECK (max_cost_microusd IS NULL OR max_cost_microusd >= 0),
  max_tool_calls integer NOT NULL CHECK (max_tool_calls > 0),
  max_wall_clock_ms bigint NOT NULL CHECK (max_wall_clock_ms > 0),
  started_at timestamptz NOT NULL DEFAULT now(),
  refusal_code text CHECK (
    refusal_code IS NULL OR refusal_code IN (
      'run_cost_cap', 'run_tool_call_cap', 'run_time_cap',
      'tool_loop', 'subagent_depth_cap', 'subagent_fanout_cap',
      'subagent_attempt_cap'
    )
  ),
  refused_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((parent_run_id IS NULL) = (depth = 0)),
  CHECK ((parent_run_id IS NULL) = (delegation_key IS NULL)),
  CHECK ((refusal_code IS NULL) = (refused_at IS NULL)),
  FOREIGN KEY (run_id, user_id)
    REFERENCES public.cloud_agent_runs(id, user_id) ON DELETE CASCADE,
  FOREIGN KEY (parent_run_id, user_id)
    REFERENCES public.cloud_agent_runs(id, user_id) ON DELETE CASCADE
);

-- Fan-out is counted per parent on every delegation, and a child budget is read
-- by its parent id rather than its own.
CREATE INDEX IF NOT EXISTS cloud_agent_run_budgets_parent_idx
  ON public.cloud_agent_run_budgets (parent_run_id, delegation_key)
  WHERE parent_run_id IS NOT NULL;

COMMENT ON TABLE public.cloud_agent_run_budgets IS
  'Per-run spend, tool-call, wall-clock and subagent-tree caps for Managed Cloud runs, authorised before each durable operation.';
COMMENT ON COLUMN public.cloud_agent_run_budgets.max_cost_microusd IS
  'Micro-USD ceiling for this run. NULL is uncapped and exists only for runs that predate this table.';
COMMENT ON COLUMN public.cloud_agent_run_budgets.delegation_key IS
  'Names the delegation, not the attempt: a retried child reuses the key and does not consume a second fan-out slot.';
COMMENT ON COLUMN public.cloud_agent_run_budgets.refusal_code IS
  'Which cap stopped this run. Recorded so the reason the user was given outlives the process that decided it.';

DROP TRIGGER IF EXISTS set_cloud_agent_run_budgets_updated_at
  ON public.cloud_agent_run_budgets;
CREATE TRIGGER set_cloud_agent_run_budgets_updated_at
  BEFORE UPDATE ON public.cloud_agent_run_budgets
  FOR EACH ROW EXECUTE FUNCTION public.set_row_updated_at();

ALTER TABLE public.cloud_agent_run_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cloud_agent_run_budgets FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cloud_agent_run_budgets_user_isolation
  ON public.cloud_agent_run_budgets;
CREATE POLICY cloud_agent_run_budgets_user_isolation
  ON public.cloud_agent_run_budgets
  USING (user_id = public.current_app_user_id())
  WITH CHECK (user_id = public.current_app_user_id());

REVOKE ALL ON public.cloud_agent_run_budgets FROM public;
GRANT SELECT, INSERT, UPDATE ON public.cloud_agent_run_budgets TO app_rls;

COMMIT;

-- =============================================================================
-- VERIFICATION — run MANUALLY on a throwaway Neon BRANCH before production.
-- (Commented so it never runs during apply.)
-- =============================================================================
-- -- 1. No run is capped by this migration alone:
-- --    SELECT count(*) FROM public.cloud_agent_run_budgets;      -- EXPECT: 0
--
-- -- 2. A malformed subagent tree cannot be stored:
-- --    INSERT INTO public.cloud_agent_run_budgets
-- --      (run_id, user_id, depth, max_tool_calls, max_wall_clock_ms)
-- --      VALUES ('<run>', '<user>', 1, 500, 21600000);           -- EXPECT: check violation
--
-- -- 3. A budget cannot point at another person's run:
-- --    INSERT INTO public.cloud_agent_run_budgets
-- --      (run_id, user_id, parent_run_id, delegation_key, depth,
-- --       max_tool_calls, max_wall_clock_ms)
-- --      VALUES ('<run>', '<user-a>', '<user-b-run>', 'k', 1, 500, 21600000);
-- --                                                              -- EXPECT: FK violation
--
-- -- 4. Another tenant cannot read a budget:
-- --    SET ROLE app_rls;
-- --    SELECT set_config('app.user_id', '<other-user>', true);
-- --    SELECT count(*) FROM public.cloud_agent_run_budgets;      -- EXPECT: 0
-- =============================================================================
