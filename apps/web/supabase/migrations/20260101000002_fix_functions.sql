-- 20260101000002_fix_functions.sql
-- Drop and recreate functions with correct signatures

-- =============================================================================
-- 1. DROP EXISTING FUNCTIONS (if they exist)
-- =============================================================================
DROP FUNCTION IF EXISTS public.get_credit_balance(UUID);
DROP FUNCTION IF EXISTS public.check_credits_available(UUID, INTEGER);
DROP FUNCTION IF EXISTS public.deduct_credits(UUID, INTEGER, TEXT, JSONB);
DROP FUNCTION IF EXISTS public.get_or_create_credit_account(UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER);
DROP FUNCTION IF EXISTS public.reset_credits_for_period(UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER);
DROP FUNCTION IF EXISTS public.calculate_daily_limit(INTEGER);

-- =============================================================================
-- 2. Create processed_stripe_events table if not exists
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.processed_stripe_events (
  event_id text NOT NULL,
  processed_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT processed_stripe_events_pkey PRIMARY KEY (event_id)
);

-- =============================================================================
-- 3. Add missing columns to token_credits if they don't exist
-- =============================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public'
                 AND table_name = 'token_credits'
                 AND column_name = 'daily_used_cents') THEN
    ALTER TABLE public.token_credits ADD COLUMN daily_used_cents integer DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public'
                 AND table_name = 'token_credits'
                 AND column_name = 'last_daily_reset_at') THEN
    ALTER TABLE public.token_credits ADD COLUMN last_daily_reset_at timestamp with time zone;
  END IF;
END $$;

-- =============================================================================
-- 4. Create indexes if not exist
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_token_credits_user_id ON public.token_credits(user_id);
CREATE INDEX IF NOT EXISTS idx_token_credits_subscription_id ON public.token_credits(subscription_id);
CREATE INDEX IF NOT EXISTS idx_token_credits_period ON public.token_credits(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_id ON public.credit_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_account_id ON public.credit_transactions(credit_account_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON public.subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON public.subscriptions(status);

-- Unique constraint for credit period upsert
CREATE UNIQUE INDEX IF NOT EXISTS idx_token_credits_unique_period
  ON public.token_credits(user_id, subscription_id, period_start, period_end);

-- =============================================================================
-- 5. Enable RLS on tables
-- =============================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.token_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.processed_stripe_events ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- 6. Drop and recreate RLS policies
-- =============================================================================

-- Profiles policies
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Service role has full access to profiles" ON public.profiles;

CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Service role has full access to profiles"
  ON public.profiles FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Subscriptions policies
DROP POLICY IF EXISTS "Users can view own subscription" ON public.subscriptions;
DROP POLICY IF EXISTS "Service role manages subscriptions" ON public.subscriptions;

CREATE POLICY "Users can view own subscription"
  ON public.subscriptions FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Service role manages subscriptions"
  ON public.subscriptions FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Token Credits policies
DROP POLICY IF EXISTS "Users can view own credits" ON public.token_credits;
DROP POLICY IF EXISTS "Service role manages credits" ON public.token_credits;

CREATE POLICY "Users can view own credits"
  ON public.token_credits FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Service role manages credits"
  ON public.token_credits FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Credit Transactions policies
DROP POLICY IF EXISTS "Users can view own transactions" ON public.credit_transactions;
DROP POLICY IF EXISTS "Service role manages transactions" ON public.credit_transactions;

CREATE POLICY "Users can view own transactions"
  ON public.credit_transactions FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Service role manages transactions"
  ON public.credit_transactions FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Processed Stripe Events policies
DROP POLICY IF EXISTS "Service role manages stripe events" ON public.processed_stripe_events;

CREATE POLICY "Service role manages stripe events"
  ON public.processed_stripe_events FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- =============================================================================
-- 7. CREATE FUNCTIONS
-- =============================================================================

-- Helper function: Calculate daily limit (30% of monthly)
CREATE FUNCTION public.calculate_daily_limit(monthly_cents INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN FLOOR(monthly_cents * 0.30);
END;
$$;

-- Get credit balance for a user
CREATE FUNCTION public.get_credit_balance(p_user_id UUID)
RETURNS TABLE (
  account_id UUID,
  credits_allocated_cents INTEGER,
  credits_used_cents INTEGER,
  credits_remaining_cents INTEGER,
  daily_limit_cents INTEGER,
  daily_used_cents INTEGER,
  daily_remaining_cents INTEGER,
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,
  last_daily_reset_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_account RECORD;
  v_daily_limit INTEGER;
  v_daily_used INTEGER;
  v_needs_reset BOOLEAN;
BEGIN
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

-- Check if user has sufficient credits
CREATE FUNCTION public.check_credits_available(
  p_user_id UUID,
  p_amount_cents INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_balance RECORD;
BEGIN
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

-- Deduct credits with atomic transaction
CREATE FUNCTION public.deduct_credits(
  p_user_id UUID,
  p_amount_cents INTEGER,
  p_description TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::JSONB
)
RETURNS TABLE (
  success BOOLEAN,
  remaining_cents INTEGER,
  error TEXT,
  code TEXT,
  daily_limit INTEGER,
  daily_used INTEGER,
  daily_remaining INTEGER,
  reset_in_hours NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_account RECORD;
  v_daily_limit INTEGER;
  v_needs_reset BOOLEAN;
  v_hours_until_reset NUMERIC;
BEGIN
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

-- Get or create credit account
CREATE FUNCTION public.get_or_create_credit_account(
  p_user_id UUID,
  p_subscription_id UUID,
  p_period_start TIMESTAMPTZ,
  p_period_end TIMESTAMPTZ,
  p_credits_allocated_cents INTEGER
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_account_id UUID;
BEGIN
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

-- Reset credits for new billing period
CREATE FUNCTION public.reset_credits_for_period(
  p_user_id UUID,
  p_subscription_id UUID,
  p_period_start TIMESTAMPTZ,
  p_period_end TIMESTAMPTZ,
  p_credits_allocated_cents INTEGER
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_account_id UUID;
BEGIN
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

-- =============================================================================
-- 8. Auto-create profile trigger
-- =============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1))
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
