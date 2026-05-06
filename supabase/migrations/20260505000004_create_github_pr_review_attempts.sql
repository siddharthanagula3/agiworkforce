-- Migration: github_pr_review_attempts (web-HIGH-3 spend-cap + idempotency)
-- ===========================================================================
--
-- Background
-- ----------
-- The GitHub PR-review webhook handler at
--   apps/web/app/api/github/webhook/route.ts
-- was exposed to two cost-amplification vectors:
--
-- 1. **No per-PR debounce.** A spam campaign of 200 webhook events per minute
--    per installation would each spawn a fire-and-forget `processReview` call
--    against `ANTHROPIC_API_KEY`. Vercel `withRateLimit('github-webhook')` is
--    keyed by IP, not installation_id — a botnet-distributed source IP set
--    bypasses it.
-- 2. **No monthly spend cap per installation.** A compromised or malicious
--    installation could drive unbounded LLM cost on the server's API key.
--
-- This table is the durable backing store for both guards. The `route.ts`
-- handler:
--   - Inserts a row with status='pending' BEFORE the LLM call.
--   - Skips the LLM call (and posts a "review in progress" comment) if a row
--     for the same (installation_id, pr_number) already exists with
--     status='pending' in the last 5 minutes (debounce).
--   - Counts completed/pending rows in the last 30 days; if >= cap, skips the
--     LLM call (and posts a quota-exceeded comment).
--   - Updates status to 'completed' / 'failed' after the LLM call.
--
-- Threat model & data scope
-- -------------------------
-- The table holds NO user-identifying data and NO LLM content. Only:
--   - installation_id (already public on every webhook payload)
--   - pr_number, repo_owner, repo_name (already public if repo is public)
--   - tokens_used (numeric counter)
-- It is service-role-only by RLS. No user-facing reads.
--
-- Cleanup
-- -------
-- Rows older than 30 days are deleted via a pg_cron job (defined below).
-- The 30-day window is the same as the spend-cap measurement window, so older
-- rows have no operational value.

CREATE TABLE IF NOT EXISTS public.github_pr_review_attempts (
  id              uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  installation_id bigint         NOT NULL,
  pr_number       integer        NOT NULL,
  repo_owner      text           NOT NULL,
  repo_name       text           NOT NULL,
  status          text           NOT NULL DEFAULT 'pending'
                                  CHECK (status IN ('pending', 'completed', 'failed', 'skipped_debounce', 'skipped_quota')),
  tokens_used     integer        DEFAULT 0,
  attempted_at    timestamptz    NOT NULL DEFAULT now(),
  completed_at    timestamptz
);

-- Hot path for debounce (last 5 min by installation+PR) and spend cap
-- (last 30 days by installation). DESC on attempted_at lets the planner do a
-- backwards index scan with LIMIT 1 for the debounce check.
CREATE INDEX IF NOT EXISTS idx_github_pr_review_attempts_installation_pr_attempted
  ON public.github_pr_review_attempts (installation_id, pr_number, attempted_at DESC);

CREATE INDEX IF NOT EXISTS idx_github_pr_review_attempts_installation_attempted
  ON public.github_pr_review_attempts (installation_id, attempted_at DESC);

-- RLS: service-role only. Webhook handler runs with service-role key; no
-- legitimate user-facing access path exists.
ALTER TABLE public.github_pr_review_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access" ON public.github_pr_review_attempts;
CREATE POLICY "Service role full access"
  ON public.github_pr_review_attempts
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- No INSERT/SELECT/UPDATE/DELETE policies for `authenticated` or `anon` —
-- they have zero access. This is intentional.

COMMENT ON TABLE public.github_pr_review_attempts IS
  'Idempotency + spend-cap log for GitHub PR review webhook (web-HIGH-3, 2026-05-05).';
COMMENT ON COLUMN public.github_pr_review_attempts.status IS
  'pending: row inserted before LLM call. completed: LLM returned successfully. failed: LLM error. skipped_debounce: another attempt in last 5min. skipped_quota: monthly cap reached.';

-- Cleanup job — drops rows older than 30 days. Runs hourly.
-- Uses pg_cron if available; otherwise the migration is a no-op for cleanup
-- and rows accumulate (acceptable for an MVP since the indexes are narrow).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Drop existing job by name (idempotent)
    PERFORM cron.unschedule('github-pr-review-attempts-cleanup')
      WHERE EXISTS (
        SELECT 1 FROM cron.job WHERE jobname = 'github-pr-review-attempts-cleanup'
      );
    PERFORM cron.schedule(
      'github-pr-review-attempts-cleanup',
      '0 * * * *', -- every hour at :00
      $cron$
        DELETE FROM public.github_pr_review_attempts
         WHERE attempted_at < now() - interval '30 days'
      $cron$
    );
    RAISE NOTICE 'Scheduled cleanup job: github-pr-review-attempts-cleanup';
  ELSE
    RAISE NOTICE 'pg_cron not installed — skipping cleanup schedule. Apply manually if needed.';
  END IF;
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'Insufficient privilege to schedule pg_cron job — apply via dashboard.';
END
$$;
