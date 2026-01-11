-- Migration: Add idempotency support to credit deductions
-- Fixes: C6 Non-Idempotent Credit Deduction
-- Prevents duplicate credit deductions from retried requests

-- Create idempotency keys table
CREATE TABLE IF NOT EXISTS public.credit_idempotency_keys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  idempotency_key TEXT NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  result JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours')
);

-- Index for fast lookup
CREATE INDEX IF NOT EXISTS idx_credit_idempotency_key
  ON public.credit_idempotency_keys(idempotency_key);

-- Index for user cleanup
CREATE INDEX IF NOT EXISTS idx_credit_idempotency_user_id
  ON public.credit_idempotency_keys(user_id);

-- Index for expiry cleanup
CREATE INDEX IF NOT EXISTS idx_credit_idempotency_expires
  ON public.credit_idempotency_keys(expires_at);

-- Enable RLS
ALTER TABLE public.credit_idempotency_keys ENABLE ROW LEVEL SECURITY;

-- Only service role can access idempotency keys
CREATE POLICY "Service role can manage credit idempotency keys"
  ON public.credit_idempotency_keys
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Grant permissions
GRANT ALL ON public.credit_idempotency_keys TO service_role;

-- Create updated deduct_credits function with idempotency support
CREATE OR REPLACE FUNCTION public.deduct_credits(
  p_user_id uuid,
  p_amount_cents integer,
  p_description text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_idempotency_key text DEFAULT NULL
)
RETURNS TABLE(
  success boolean,
  remaining_cents integer,
  error text,
  code text,
  daily_limit integer,
  daily_used integer,
  daily_remaining integer,
  reset_in_hours numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_account RECORD;
  v_daily_limit INTEGER;
  v_needs_reset BOOLEAN;
  v_hours_until_reset NUMERIC;
  v_existing_result JSONB;
  v_result JSONB;
BEGIN
  -- Authorization check
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
      RAISE EXCEPTION 'Not authorized';
    END IF;
  END IF;

  -- IDEMPOTENCY CHECK: If idempotency key provided, check if already processed
  IF p_idempotency_key IS NOT NULL THEN
    SELECT result INTO v_existing_result
    FROM public.credit_idempotency_keys
    WHERE idempotency_key = p_idempotency_key
      AND user_id = p_user_id
      AND expires_at > NOW();

    IF v_existing_result IS NOT NULL THEN
      -- Return the cached result
      RETURN QUERY SELECT
        (v_existing_result->>'success')::BOOLEAN,
        (v_existing_result->>'remaining_cents')::INTEGER,
        v_existing_result->>'error',
        v_existing_result->>'code',
        (v_existing_result->>'daily_limit')::INTEGER,
        (v_existing_result->>'daily_used')::INTEGER,
        (v_existing_result->>'daily_remaining')::INTEGER,
        (v_existing_result->>'reset_in_hours')::NUMERIC;
      RETURN;
    END IF;
  END IF;

  -- Get and lock the credit account
  SELECT tc.* INTO v_account
  FROM public.token_credits tc
  WHERE tc.user_id = p_user_id
    AND tc.period_end > NOW()
  ORDER BY tc.period_end DESC
  LIMIT 1
  FOR UPDATE;

  IF v_account IS NULL THEN
    v_result := jsonb_build_object(
      'success', FALSE,
      'remaining_cents', 0,
      'error', 'No active credit account found',
      'code', 'NO_ACCOUNT',
      'daily_limit', 0,
      'daily_used', 0,
      'daily_remaining', 0,
      'reset_in_hours', 0
    );

    -- Store idempotency result if key provided
    IF p_idempotency_key IS NOT NULL THEN
      INSERT INTO public.credit_idempotency_keys (idempotency_key, user_id, result)
      VALUES (p_idempotency_key, p_user_id, v_result)
      ON CONFLICT (idempotency_key) DO NOTHING;
    END IF;

    RETURN QUERY SELECT FALSE, 0, 'No active credit account found'::TEXT, 'NO_ACCOUNT'::TEXT, 0, 0, 0, 0::NUMERIC;
    RETURN;
  END IF;

  v_daily_limit := public.calculate_daily_limit(v_account.credits_allocated_cents);
  v_needs_reset := v_account.last_daily_reset_at IS NULL
    OR v_account.last_daily_reset_at < NOW() - INTERVAL '24 hours';

  IF v_needs_reset THEN
    UPDATE public.token_credits
    SET daily_used_cents = 0, last_daily_reset_at = NOW(), updated_at = NOW()
    WHERE id = v_account.id;
    v_account.daily_used_cents := 0;
    v_account.last_daily_reset_at := NOW();
  END IF;

  v_hours_until_reset := EXTRACT(EPOCH FROM
    (v_account.last_daily_reset_at + INTERVAL '24 hours' - NOW())
  ) / 3600;

  -- Check daily limit
  IF COALESCE(v_account.daily_used_cents, 0) + p_amount_cents > v_daily_limit THEN
    v_result := jsonb_build_object(
      'success', FALSE,
      'remaining_cents', v_account.credits_remaining_cents,
      'error', 'Daily credit limit exceeded',
      'code', 'DAILY_CREDIT_LIMIT_REACHED',
      'daily_limit', v_daily_limit,
      'daily_used', COALESCE(v_account.daily_used_cents, 0),
      'daily_remaining', GREATEST(0, v_daily_limit - COALESCE(v_account.daily_used_cents, 0)),
      'reset_in_hours', GREATEST(0, v_hours_until_reset)
    );

    IF p_idempotency_key IS NOT NULL THEN
      INSERT INTO public.credit_idempotency_keys (idempotency_key, user_id, result)
      VALUES (p_idempotency_key, p_user_id, v_result)
      ON CONFLICT (idempotency_key) DO NOTHING;
    END IF;

    RETURN QUERY SELECT
      FALSE, v_account.credits_remaining_cents,
      'Daily credit limit exceeded'::TEXT, 'DAILY_CREDIT_LIMIT_REACHED'::TEXT,
      v_daily_limit, COALESCE(v_account.daily_used_cents, 0),
      GREATEST(0, v_daily_limit - COALESCE(v_account.daily_used_cents, 0)),
      GREATEST(0, v_hours_until_reset);
    RETURN;
  END IF;

  -- Check monthly limit
  IF v_account.credits_remaining_cents < p_amount_cents THEN
    v_result := jsonb_build_object(
      'success', FALSE,
      'remaining_cents', v_account.credits_remaining_cents,
      'error', 'Monthly credit limit exceeded',
      'code', 'MONTHLY_CREDIT_LIMIT_REACHED',
      'daily_limit', v_daily_limit,
      'daily_used', COALESCE(v_account.daily_used_cents, 0),
      'daily_remaining', GREATEST(0, v_daily_limit - COALESCE(v_account.daily_used_cents, 0)),
      'reset_in_hours', GREATEST(0, v_hours_until_reset)
    );

    IF p_idempotency_key IS NOT NULL THEN
      INSERT INTO public.credit_idempotency_keys (idempotency_key, user_id, result)
      VALUES (p_idempotency_key, p_user_id, v_result)
      ON CONFLICT (idempotency_key) DO NOTHING;
    END IF;

    RETURN QUERY SELECT
      FALSE, v_account.credits_remaining_cents,
      'Monthly credit limit exceeded'::TEXT, 'MONTHLY_CREDIT_LIMIT_REACHED'::TEXT,
      v_daily_limit, COALESCE(v_account.daily_used_cents, 0),
      GREATEST(0, v_daily_limit - COALESCE(v_account.daily_used_cents, 0)),
      GREATEST(0, v_hours_until_reset);
    RETURN;
  END IF;

  -- Perform the deduction
  UPDATE public.token_credits
  SET credits_used_cents = credits_used_cents + p_amount_cents,
      credits_remaining_cents = credits_remaining_cents - p_amount_cents,
      daily_used_cents = COALESCE(daily_used_cents, 0) + p_amount_cents,
      updated_at = NOW()
  WHERE id = v_account.id;

  -- Record the transaction
  INSERT INTO public.credit_transactions (
    user_id, credit_account_id, transaction_type, amount_cents, description, metadata
  ) VALUES (
    p_user_id, v_account.id, 'deduction', p_amount_cents, p_description,
    CASE WHEN p_idempotency_key IS NOT NULL
      THEN p_metadata || jsonb_build_object('idempotency_key', p_idempotency_key)
      ELSE p_metadata
    END
  );

  -- Build success result
  v_result := jsonb_build_object(
    'success', TRUE,
    'remaining_cents', v_account.credits_remaining_cents - p_amount_cents,
    'error', NULL,
    'code', NULL,
    'daily_limit', v_daily_limit,
    'daily_used', COALESCE(v_account.daily_used_cents, 0) + p_amount_cents,
    'daily_remaining', GREATEST(0, v_daily_limit - COALESCE(v_account.daily_used_cents, 0) - p_amount_cents),
    'reset_in_hours', GREATEST(0, v_hours_until_reset)
  );

  -- Store idempotency result if key provided
  IF p_idempotency_key IS NOT NULL THEN
    INSERT INTO public.credit_idempotency_keys (idempotency_key, user_id, result)
    VALUES (p_idempotency_key, p_user_id, v_result)
    ON CONFLICT (idempotency_key) DO NOTHING;
  END IF;

  RETURN QUERY SELECT
    TRUE, v_account.credits_remaining_cents - p_amount_cents,
    NULL::TEXT, NULL::TEXT,
    v_daily_limit, COALESCE(v_account.daily_used_cents, 0) + p_amount_cents,
    GREATEST(0, v_daily_limit - COALESCE(v_account.daily_used_cents, 0) - p_amount_cents),
    GREATEST(0, v_hours_until_reset);
END;
$$;

-- Update grants to allow the new parameter
REVOKE ALL ON FUNCTION public.deduct_credits(uuid, integer, text, jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.deduct_credits(uuid, integer, text, jsonb, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.deduct_credits(uuid, integer, text, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.deduct_credits(uuid, integer, text, jsonb, text) TO service_role;

-- Cleanup function for expired idempotency keys (run periodically)
CREATE OR REPLACE FUNCTION public.cleanup_expired_idempotency_keys()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_deleted_count INTEGER;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  DELETE FROM public.credit_idempotency_keys
  WHERE expires_at < NOW();

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  RETURN v_deleted_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cleanup_expired_idempotency_keys() TO service_role;
