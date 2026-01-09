-- Lock down credit RPCs: prevent PUBLIC/anon access and enforce per-user authorization.
--
-- Why this exists:
-- - These functions are SECURITY DEFINER and were previously executable by PUBLIC/anon/authenticated.
-- - Without explicit authorization checks, any caller could pass arbitrary p_user_id and mutate/read other users' credits.
-- - This migration makes the functions safe-by-default and limits EXECUTE privileges.

-- 1) Harden add_credits (service_role only) and fix mutable search_path
CREATE OR REPLACE FUNCTION public.add_credits(
  p_user_id uuid,
  p_account_id uuid,
  p_amount_cents integer,
  p_description text,
  p_transaction_type text DEFAULT 'purchase'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  -- Only backend (service_role) can add credits.
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Validate inputs
  IF p_amount_cents <= 0 THEN
    RAISE EXCEPTION 'Credit amount must be positive';
  END IF;

  IF p_transaction_type NOT IN ('purchase', 'adjustment', 'refund', 'bonus') THEN
    RAISE EXCEPTION 'Invalid transaction type';
  END IF;

  -- Update the token_credits table
  UPDATE public.token_credits
  SET
    credits_allocated_cents = credits_allocated_cents + p_amount_cents,
    credits_remaining_cents = credits_remaining_cents + p_amount_cents,
    updated_at = now()
  WHERE id = p_account_id AND user_id = p_user_id;

  -- Verify the update succeeded
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Credit account not found for user';
  END IF;

  -- Record the transaction
  INSERT INTO public.credit_transactions (
    user_id,
    credit_account_id,
    amount_cents,
    transaction_type,
    description
  ) VALUES (
    p_user_id,
    p_account_id,
    p_amount_cents,
    p_transaction_type,
    p_description
  );
END;
$$;

-- 2) Harden get_credit_balance (authenticated can only read their own; service_role can read any)
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
  v_daily_limit INTEGER;
  v_daily_used INTEGER;
  v_needs_reset BOOLEAN;
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
      NULL::UUID, 0, 0, 0, 0, 0, 0,
      NULL::TIMESTAMPTZ, NULL::TIMESTAMPTZ, NULL::TIMESTAMPTZ;
    RETURN;
  END IF;

  v_daily_limit := public.calculate_daily_limit(v_account.credits_allocated_cents);
  v_needs_reset := v_account.last_daily_reset_at IS NULL
    OR v_account.last_daily_reset_at < NOW() - INTERVAL '24 hours';

  IF v_needs_reset THEN
    UPDATE public.token_credits
    SET daily_used_cents = 0,
        last_daily_reset_at = NOW(),
        updated_at = NOW()
    WHERE id = v_account.id;
    v_daily_used := 0;
  ELSE
    v_daily_used := COALESCE(v_account.daily_used_cents, 0);
  END IF;

  RETURN QUERY SELECT
    v_account.id,
    v_account.credits_allocated_cents,
    v_account.credits_used_cents,
    v_account.credits_remaining_cents,
    v_daily_limit,
    v_daily_used,
    GREATEST(0, v_daily_limit - v_daily_used),
    v_account.period_start,
    v_account.period_end,
    COALESCE(v_account.last_daily_reset_at, NOW());
END;
$$;

-- 3) Harden check_credits_available (authenticated can only check their own; service_role can check any)
CREATE OR REPLACE FUNCTION public.check_credits_available(p_user_id uuid, p_amount_cents integer)
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

  IF v_balance.credits_remaining_cents < p_amount_cents THEN
    RETURN FALSE;
  END IF;

  IF v_balance.daily_remaining_cents < p_amount_cents THEN
    RETURN FALSE;
  END IF;

  RETURN TRUE;
END;
$$;

-- 4) Harden deduct_credits (authenticated can only deduct their own; service_role can deduct any)
CREATE OR REPLACE FUNCTION public.deduct_credits(
  p_user_id uuid,
  p_amount_cents integer,
  p_description text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
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
  LIMIT 1
  FOR UPDATE;

  IF v_account IS NULL THEN
    RETURN QUERY SELECT
      FALSE, 0, 'No active credit account found'::TEXT, 'NO_ACCOUNT'::TEXT,
      0, 0, 0, 0::NUMERIC;
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

  IF COALESCE(v_account.daily_used_cents, 0) + p_amount_cents > v_daily_limit THEN
    RETURN QUERY SELECT
      FALSE, v_account.credits_remaining_cents,
      'Daily credit limit exceeded'::TEXT, 'DAILY_CREDIT_LIMIT_REACHED'::TEXT,
      v_daily_limit, COALESCE(v_account.daily_used_cents, 0),
      GREATEST(0, v_daily_limit - COALESCE(v_account.daily_used_cents, 0)),
      GREATEST(0, v_hours_until_reset);
    RETURN;
  END IF;

  IF v_account.credits_remaining_cents < p_amount_cents THEN
    RETURN QUERY SELECT
      FALSE, v_account.credits_remaining_cents,
      'Monthly credit limit exceeded'::TEXT, 'MONTHLY_CREDIT_LIMIT_REACHED'::TEXT,
      v_daily_limit, COALESCE(v_account.daily_used_cents, 0),
      GREATEST(0, v_daily_limit - COALESCE(v_account.daily_used_cents, 0)),
      GREATEST(0, v_hours_until_reset);
    RETURN;
  END IF;

  UPDATE public.token_credits
  SET credits_used_cents = credits_used_cents + p_amount_cents,
      credits_remaining_cents = credits_remaining_cents - p_amount_cents,
      daily_used_cents = COALESCE(daily_used_cents, 0) + p_amount_cents,
      updated_at = NOW()
  WHERE id = v_account.id;

  INSERT INTO public.credit_transactions (
    user_id, credit_account_id, transaction_type, amount_cents, description, metadata
  ) VALUES (
    p_user_id, v_account.id, 'deduction', p_amount_cents, p_description, p_metadata
  );

  RETURN QUERY SELECT
    TRUE, v_account.credits_remaining_cents - p_amount_cents,
    NULL::TEXT, NULL::TEXT,
    v_daily_limit, COALESCE(v_account.daily_used_cents, 0) + p_amount_cents,
    GREATEST(0, v_daily_limit - COALESCE(v_account.daily_used_cents, 0) - p_amount_cents),
    GREATEST(0, v_hours_until_reset);
END;
$$;

-- 5) Restrict account creation/reset to service_role only
CREATE OR REPLACE FUNCTION public.get_or_create_credit_account(
  p_user_id uuid,
  p_subscription_id uuid,
  p_period_start timestamp with time zone,
  p_period_end timestamp with time zone,
  p_credits_allocated_cents integer
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_account_id UUID;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT id INTO v_account_id
  FROM public.token_credits
  WHERE user_id = p_user_id
    AND subscription_id = p_subscription_id
    AND period_start = p_period_start
    AND period_end = p_period_end;

  IF v_account_id IS NOT NULL THEN
    RETURN v_account_id;
  END IF;

  INSERT INTO public.token_credits (
    user_id, subscription_id, period_start, period_end,
    credits_allocated_cents, credits_remaining_cents,
    daily_used_cents, last_daily_reset_at
  ) VALUES (
    p_user_id, p_subscription_id, p_period_start, p_period_end,
    p_credits_allocated_cents, p_credits_allocated_cents, 0, NOW()
  )
  RETURNING id INTO v_account_id;

  INSERT INTO public.credit_transactions (
    user_id, credit_account_id, transaction_type, amount_cents, description
  ) VALUES (
    p_user_id, v_account_id, 'allocation', p_credits_allocated_cents,
    'Initial credit allocation for billing period'
  );

  RETURN v_account_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.reset_credits_for_period(
  p_user_id uuid,
  p_subscription_id uuid,
  p_period_start timestamp with time zone,
  p_period_end timestamp with time zone,
  p_credits_allocated_cents integer
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_account_id UUID;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  INSERT INTO public.token_credits (
    user_id, subscription_id, period_start, period_end,
    credits_allocated_cents, credits_used_cents, credits_remaining_cents,
    daily_used_cents, last_daily_reset_at
  ) VALUES (
    p_user_id, p_subscription_id, p_period_start, p_period_end,
    p_credits_allocated_cents, 0, p_credits_allocated_cents, 0, NOW()
  )
  ON CONFLICT (user_id, subscription_id, period_start, period_end)
  DO UPDATE SET
    credits_allocated_cents = p_credits_allocated_cents,
    credits_used_cents = 0,
    credits_remaining_cents = p_credits_allocated_cents,
    daily_used_cents = 0,
    last_daily_reset_at = NOW(),
    updated_at = NOW()
  RETURNING id INTO v_account_id;

  INSERT INTO public.credit_transactions (
    user_id, credit_account_id, transaction_type, amount_cents, description
  ) VALUES (
    p_user_id, v_account_id, 'reset', p_credits_allocated_cents,
    'Credit reset for new billing period'
  );

  RETURN v_account_id;
END;
$$;

-- 6) Tighten EXECUTE grants
-- add_credits
REVOKE ALL ON FUNCTION public.add_credits(uuid, uuid, integer, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.add_credits(uuid, uuid, integer, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.add_credits(uuid, uuid, integer, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.add_credits(uuid, uuid, integer, text, text) TO service_role;

-- get_credit_balance
REVOKE ALL ON FUNCTION public.get_credit_balance(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_credit_balance(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_credit_balance(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_credit_balance(uuid) TO service_role;

-- check_credits_available
REVOKE ALL ON FUNCTION public.check_credits_available(uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_credits_available(uuid, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.check_credits_available(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_credits_available(uuid, integer) TO service_role;

-- deduct_credits
REVOKE ALL ON FUNCTION public.deduct_credits(uuid, integer, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.deduct_credits(uuid, integer, text, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.deduct_credits(uuid, integer, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.deduct_credits(uuid, integer, text, jsonb) TO service_role;

-- get_or_create_credit_account
REVOKE ALL ON FUNCTION public.get_or_create_credit_account(uuid, uuid, timestamptz, timestamptz, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_or_create_credit_account(uuid, uuid, timestamptz, timestamptz, integer) FROM anon;
REVOKE ALL ON FUNCTION public.get_or_create_credit_account(uuid, uuid, timestamptz, timestamptz, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_or_create_credit_account(uuid, uuid, timestamptz, timestamptz, integer) TO service_role;

-- reset_credits_for_period
REVOKE ALL ON FUNCTION public.reset_credits_for_period(uuid, uuid, timestamptz, timestamptz, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reset_credits_for_period(uuid, uuid, timestamptz, timestamptz, integer) FROM anon;
REVOKE ALL ON FUNCTION public.reset_credits_for_period(uuid, uuid, timestamptz, timestamptz, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reset_credits_for_period(uuid, uuid, timestamptz, timestamptz, integer) TO service_role;


