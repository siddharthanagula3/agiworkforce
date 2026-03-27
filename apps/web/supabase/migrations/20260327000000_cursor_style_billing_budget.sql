-- Cursor-style billing-period budgets:
-- - no daily cap enforcement
-- - a single included usage budget per billing period
-- - idempotent deductions still supported

CREATE OR REPLACE FUNCTION public.get_credit_balance(p_user_id uuid)
RETURNS TABLE(
  account_id uuid,
  credits_allocated_cents integer,
  credits_used_cents integer,
  credits_remaining_cents integer,
  daily_limit_cents integer,
  daily_used_cents integer,
  daily_remaining_cents integer,
  period_start timestamp with time zone,
  period_end timestamp with time zone,
  last_daily_reset_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_account RECORD;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
      RAISE EXCEPTION 'Not authorized';
    END IF;
  END IF;

  SELECT tc.* INTO v_account
  FROM public.token_credits tc
  WHERE tc.user_id = p_user_id
    AND tc.period_end > NOW()
  ORDER BY tc.period_end DESC
  LIMIT 1;

  IF v_account IS NULL THEN
    RETURN QUERY SELECT
      NULL::UUID,
      0,
      0,
      0,
      0,
      0,
      0,
      NULL::TIMESTAMPTZ,
      NULL::TIMESTAMPTZ,
      NULL::TIMESTAMPTZ;
    RETURN;
  END IF;

  RETURN QUERY SELECT
    v_account.id,
    COALESCE(v_account.credits_allocated_cents, 0),
    COALESCE(v_account.credits_used_cents, 0),
    COALESCE(v_account.credits_remaining_cents, 0),
    0,
    0,
    0,
    v_account.period_start,
    v_account.period_end,
    NULL::TIMESTAMPTZ;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_credits_available(
  p_user_id uuid,
  p_amount_cents integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_balance RECORD;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
      RAISE EXCEPTION 'Not authorized';
    END IF;
  END IF;

  SELECT * INTO v_balance FROM public.get_credit_balance(p_user_id);
  RETURN COALESCE(v_balance.credits_remaining_cents, 0) >= p_amount_cents;
END;
$$;

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
  v_existing_result JSONB;
  v_result JSONB;
  v_reset_in_hours NUMERIC := 0;
  v_new_remaining INTEGER := 0;
  v_new_used INTEGER := 0;
  v_transaction_type TEXT := 'deduction';
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
      RAISE EXCEPTION 'Not authorized';
    END IF;
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT result INTO v_existing_result
    FROM public.credit_idempotency_keys
    WHERE idempotency_key = p_idempotency_key
      AND user_id = p_user_id
      AND expires_at > NOW();

    IF v_existing_result IS NOT NULL THEN
      RETURN QUERY SELECT
        (v_existing_result->>'success')::BOOLEAN,
        (v_existing_result->>'remaining_cents')::INTEGER,
        v_existing_result->>'error',
        v_existing_result->>'code',
        COALESCE((v_existing_result->>'daily_limit')::INTEGER, 0),
        COALESCE((v_existing_result->>'daily_used')::INTEGER, 0),
        COALESCE((v_existing_result->>'daily_remaining')::INTEGER, 0),
        COALESCE((v_existing_result->>'reset_in_hours')::NUMERIC, 0);
      RETURN;
    END IF;
  END IF;

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

    IF p_idempotency_key IS NOT NULL THEN
      INSERT INTO public.credit_idempotency_keys (idempotency_key, user_id, result)
      VALUES (p_idempotency_key, p_user_id, v_result)
      ON CONFLICT (idempotency_key) DO NOTHING;
    END IF;

    RETURN QUERY SELECT FALSE, 0, 'No active credit account found'::TEXT, 'NO_ACCOUNT'::TEXT, 0, 0, 0, 0::NUMERIC;
    RETURN;
  END IF;

  IF v_account.period_end IS NOT NULL THEN
    v_reset_in_hours := GREATEST(
      0::NUMERIC,
      EXTRACT(EPOCH FROM (v_account.period_end - NOW())) / 3600
    );
  END IF;

  IF p_amount_cents >= 0 AND COALESCE(v_account.credits_remaining_cents, 0) < p_amount_cents THEN
    v_result := jsonb_build_object(
      'success', FALSE,
      'remaining_cents', COALESCE(v_account.credits_remaining_cents, 0),
      'error', 'Usage budget exhausted for this billing period',
      'code', 'MONTHLY_CREDIT_LIMIT_REACHED',
      'daily_limit', 0,
      'daily_used', 0,
      'daily_remaining', 0,
      'reset_in_hours', v_reset_in_hours
    );

    IF p_idempotency_key IS NOT NULL THEN
      INSERT INTO public.credit_idempotency_keys (idempotency_key, user_id, result)
      VALUES (p_idempotency_key, p_user_id, v_result)
      ON CONFLICT (idempotency_key) DO NOTHING;
    END IF;

    RETURN QUERY SELECT
      FALSE,
      COALESCE(v_account.credits_remaining_cents, 0),
      'Usage budget exhausted for this billing period'::TEXT,
      'MONTHLY_CREDIT_LIMIT_REACHED'::TEXT,
      0,
      0,
      0,
      v_reset_in_hours;
    RETURN;
  END IF;

  v_new_used := GREATEST(0, COALESCE(v_account.credits_used_cents, 0) + p_amount_cents);
  v_new_remaining := GREATEST(0, COALESCE(v_account.credits_remaining_cents, 0) - p_amount_cents);
  v_transaction_type := CASE WHEN p_amount_cents < 0 THEN 'refund' ELSE 'deduction' END;

  UPDATE public.token_credits
  SET credits_used_cents = v_new_used,
      credits_remaining_cents = v_new_remaining,
      updated_at = NOW()
  WHERE id = v_account.id;

  INSERT INTO public.credit_transactions (
    user_id,
    credit_account_id,
    transaction_type,
    amount_cents,
    description,
    metadata
  ) VALUES (
    p_user_id,
    v_account.id,
    v_transaction_type,
    p_amount_cents,
    p_description,
    CASE
      WHEN p_idempotency_key IS NOT NULL
        THEN p_metadata || jsonb_build_object('idempotency_key', p_idempotency_key)
      ELSE p_metadata
    END
  );

  v_result := jsonb_build_object(
    'success', TRUE,
    'remaining_cents', v_new_remaining,
    'error', NULL,
    'code', NULL,
    'daily_limit', 0,
    'daily_used', 0,
    'daily_remaining', 0,
    'reset_in_hours', v_reset_in_hours
  );

  IF p_idempotency_key IS NOT NULL THEN
    INSERT INTO public.credit_idempotency_keys (idempotency_key, user_id, result)
    VALUES (p_idempotency_key, p_user_id, v_result)
    ON CONFLICT (idempotency_key) DO NOTHING;
  END IF;

  RETURN QUERY SELECT TRUE, v_new_remaining, NULL::TEXT, NULL::TEXT, 0, 0, 0, v_reset_in_hours;
END;
$$;

REVOKE ALL ON FUNCTION public.get_credit_balance(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_credit_balance(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_credit_balance(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_credit_balance(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.check_credits_available(uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_credits_available(uuid, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.check_credits_available(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_credits_available(uuid, integer) TO service_role;

REVOKE ALL ON FUNCTION public.deduct_credits(uuid, integer, text, jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.deduct_credits(uuid, integer, text, jsonb, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.deduct_credits(uuid, integer, text, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.deduct_credits(uuid, integer, text, jsonb, text) TO service_role;
