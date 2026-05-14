-- 20260508120000_flagship_daily_cap_tracking.sql
-- Phase 3 Pro+ flagship daily-cap tracking.
--
-- Adds two columns to token_credits to track daily flagship-slot usage:
--   * flagship_daily_tokens   integer NOT NULL DEFAULT 0
--       Counts tokens consumed by flagship slots (Opus 4.7, GPT-5.5)
--       since the last daily reset.
--   * flagship_daily_reset_at timestamptz NULL
--       When the daily counter was last reset to 0. NULL = never reset.
--
-- Updates increment_usage RPC to take p_is_flagship boolean (default FALSE).
-- When TRUE the function lazy-resets the daily counter if the last reset
-- is NULL or older than 24h, then increments flagship_daily_tokens.
--
-- Preserves the existing dual-role auth check (service_role OR
-- authenticated+self), positive-amount guard, and audit-trail insert.
--
-- This migration mirrors the live state applied via Supabase MCP on
-- 2026-05-08; future drift between disk and remote should be reconciled
-- by re-running this file (idempotent).

ALTER TABLE public.token_credits
  ADD COLUMN IF NOT EXISTS flagship_daily_tokens integer NOT NULL DEFAULT 0;

ALTER TABLE public.token_credits
  ADD COLUMN IF NOT EXISTS flagship_daily_reset_at timestamptz;

COMMENT ON COLUMN public.token_credits.flagship_daily_tokens IS
  'Tokens consumed by Pro+ flagship slots (Opus 4.7, GPT-5.5) since last daily reset. Reset every 24h via increment_usage(p_is_flagship => true).';

COMMENT ON COLUMN public.token_credits.flagship_daily_reset_at IS
  'When flagship_daily_tokens was last reset to 0. NULL means never reset (treated as expired).';

DROP FUNCTION IF EXISTS public.increment_usage(uuid, integer, text);
DROP FUNCTION IF EXISTS public.increment_usage(uuid, integer, text, boolean);

CREATE OR REPLACE FUNCTION public.increment_usage(
  p_user_id uuid,
  p_tokens integer,
  p_feature text DEFAULT NULL,
  p_is_flagship boolean DEFAULT FALSE
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_account_id uuid;
  v_reset_at timestamptz;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id is required';
  END IF;

  -- Auth gate: allow service_role for cron/admin paths, OR allow authenticated
  -- users to increment ONLY their own usage row. Self-increment is safe because
  -- the SECURITY DEFINER context bypasses RLS but we explicitly verify the row
  -- being mutated belongs to the calling user.
  IF auth.role() = 'service_role' THEN
    NULL;
  ELSIF auth.role() = 'authenticated' AND auth.uid() = p_user_id THEN
    NULL;
  ELSE
    RAISE EXCEPTION 'Not authorized: cannot increment usage for another user';
  END IF;

  -- Positive-amount guard.
  IF p_tokens IS NULL OR p_tokens <= 0 THEN
    RAISE EXCEPTION 'p_tokens must be positive (got %)', p_tokens;
  END IF;

  -- Locate the active period row for this user. Prefer the row whose
  -- [period_start, period_end] window contains the current timestamp; if
  -- none matches (clock skew / boundary race) fall back to the most recent
  -- period_end so we never silently drop usage attribution.
  SELECT id, flagship_daily_reset_at INTO v_account_id, v_reset_at
  FROM public.token_credits
  WHERE user_id = p_user_id
    AND CURRENT_TIMESTAMP BETWEEN period_start AND period_end
  ORDER BY period_end DESC
  LIMIT 1
  FOR UPDATE;

  IF v_account_id IS NULL THEN
    SELECT id, flagship_daily_reset_at INTO v_account_id, v_reset_at
    FROM public.token_credits
    WHERE user_id = p_user_id
    ORDER BY period_end DESC
    LIMIT 1
    FOR UPDATE;
  END IF;

  -- No row at all for this user — emit a NOTICE and return without raising.
  IF v_account_id IS NULL THEN
    RAISE NOTICE 'increment_usage: no token_credits row for user %', p_user_id;
    RETURN;
  END IF;

  -- Atomic counter advance on the active-period row. Monthly counter always
  -- increments. Flagship daily counter increments only when caller flags the
  -- usage as flagship, with a lazy reset when the previous reset is NULL or
  -- older than 24h.
  IF p_is_flagship THEN
    IF v_reset_at IS NULL OR v_reset_at < (now() - interval '1 day') THEN
      UPDATE public.token_credits
      SET
        credits_used_cents = credits_used_cents + p_tokens,
        flagship_daily_tokens = p_tokens,
        flagship_daily_reset_at = now(),
        updated_at = now()
      WHERE id = v_account_id;
    ELSE
      UPDATE public.token_credits
      SET
        credits_used_cents = credits_used_cents + p_tokens,
        flagship_daily_tokens = flagship_daily_tokens + p_tokens,
        updated_at = now()
      WHERE id = v_account_id;
    END IF;
  ELSE
    UPDATE public.token_credits
    SET
      credits_used_cents = credits_used_cents + p_tokens,
      updated_at = now()
    WHERE id = v_account_id;
  END IF;

  -- Audit-trail row. transaction_type = 'deduction' is whitelisted by the
  -- credit_transactions CHECK constraint.
  INSERT INTO public.credit_transactions (
    user_id,
    credit_account_id,
    amount_cents,
    transaction_type,
    description,
    metadata
  ) VALUES (
    p_user_id,
    v_account_id,
    p_tokens,
    'deduction',
    'Usage increment via reconcileUsage',
    jsonb_build_object(
      'feature', COALESCE(p_feature, 'chat'),
      'is_flagship', p_is_flagship
    )
  );
END;
$$;

COMMENT ON FUNCTION public.increment_usage(uuid, integer, text, boolean) IS
  'Atomically increments token usage. p_is_flagship=true also tracks daily flagship-slot tokens with 24h lazy reset, used to enforce Pro+ flagshipDailyTokenCap.';

REVOKE ALL ON FUNCTION public.increment_usage(uuid, integer, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_usage(uuid, integer, text, boolean) TO service_role, authenticated;
