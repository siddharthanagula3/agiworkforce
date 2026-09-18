-- =============================================================================
-- Migration 0251: per-attempt outcomes for the Login and Search service levels
--
-- Why    : §90 declares an Authentication and a Search objective, and
--          apps/web/lib/server/slo/catalogue.ts had to carry `source: null` for
--          both because nothing wrote an outcome. security_audit_logs records
--          rejected credentials, which is the product working, not an outage;
--          search_history records the query and how many results came back, so
--          a search that failed and a search that matched nothing were the same
--          row. Neither could tell an outage from normal use.
--
-- Shape  : authentication_attempts is one row per verification attempt, with
--          the failure_reason that separates a rejected credential (the product
--          working) from an unreachable provider (an outage). search_history
--          gains outcome, failure_reason and duration_ms. Both carry region and
--          provider so the objective can be read per region and per provider
--          rather than only in aggregate.
--
-- Empty  : No existing search_history row gains an outcome; the columns default
--          to null and a null outcome is not a sample, so the indicator reports
--          no samples until the writers fill them rather than reporting a
--          breach. Nothing reads authentication_attempts until it has rows.
--
-- Depends: 0014 (security_audit_logs, account_sessions), 0020 (search_history),
--          0141/0144 (governance-table read-only grant convention)
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.authentication_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text,
  surface text NOT NULL CHECK (char_length(surface) BETWEEN 1 AND 64),
  -- 'rejected' is a credential the product correctly refused. It is recorded
  -- and deliberately excluded from the availability denominator: counting it as
  -- a failure would make a password typo look like an outage.
  outcome text NOT NULL CHECK (outcome = ANY (ARRAY['succeeded', 'failed', 'rejected'])),
  failure_reason text CHECK (failure_reason IS NULL OR char_length(failure_reason) <= 100),
  provider text CHECK (provider IS NULL OR char_length(provider) <= 100),
  region text CHECK (region IS NULL OR char_length(region) <= 16),
  duration_ms integer CHECK (duration_ms IS NULL OR duration_ms >= 0),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT authentication_attempts_failure_reason_present
    CHECK (outcome <> 'failed' OR failure_reason IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_authentication_attempts_occurred
  ON public.authentication_attempts (occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_authentication_attempts_outcome
  ON public.authentication_attempts (outcome, occurred_at DESC);

REVOKE ALL ON public.authentication_attempts FROM app_rls;

ALTER TABLE IF EXISTS public.search_history
  ADD COLUMN IF NOT EXISTS outcome text,
  ADD COLUMN IF NOT EXISTS failure_reason text,
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS region text,
  ADD COLUMN IF NOT EXISTS duration_ms integer;

ALTER TABLE IF EXISTS public.search_history
  DROP CONSTRAINT IF EXISTS search_history_outcome_values;

ALTER TABLE IF EXISTS public.search_history
  ADD CONSTRAINT search_history_outcome_values
    CHECK (outcome IS NULL OR outcome = ANY (ARRAY['succeeded', 'failed']));

CREATE INDEX IF NOT EXISTS idx_search_history_outcome
  ON public.search_history (outcome, created_at DESC)
  WHERE outcome IS NOT NULL;

COMMIT;
