-- 20251225000000_add_daily_credit_tracking.sql
-- Add daily credit limit tracking with rolling 24-hour windows

-- Add daily tracking columns to token_credits table
ALTER TABLE token_credits
ADD COLUMN IF NOT EXISTS daily_used_cents INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_daily_reset_at TIMESTAMPTZ;

-- Create index for efficient queries on daily reset time
CREATE INDEX IF NOT EXISTS idx_token_credits_last_daily_reset 
ON token_credits(last_daily_reset_at);

-- Function to calculate daily limit (30% of monthly)
CREATE OR REPLACE FUNCTION calculate_daily_limit(monthly_cents INTEGER)
RETURNS INTEGER AS $$
BEGIN
  RETURN FLOOR(monthly_cents * 0.30);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to check if daily credits are available (rolling 24-hour window)
CREATE OR REPLACE FUNCTION check_daily_credits_available(
  p_user_id UUID,
  p_amount_cents INTEGER
)
RETURNS BOOLEAN AS $$
DECLARE
  v_account RECORD;
  v_daily_limit INTEGER;
  v_daily_used INTEGER;
  v_window_start TIMESTAMPTZ;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  -- Get the current credit account
  SELECT * INTO v_account
  FROM token_credits
  WHERE user_id = p_user_id
    AND period_start <= v_now
    AND period_end >= v_now
  ORDER BY created_at DESC
  LIMIT 1;

  -- If no account found, return false
  IF v_account IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Calculate daily limit (30% of monthly)
  v_daily_limit := calculate_daily_limit(v_account.credits_allocated_cents);

  -- Check if rolling window has expired (>24 hours since last reset)
  IF v_account.last_daily_reset_at IS NULL OR 
     (v_now - v_account.last_daily_reset_at) >= INTERVAL '24 hours' THEN
    -- Window expired, reset daily usage
    UPDATE token_credits
    SET daily_used_cents = 0,
        last_daily_reset_at = v_now
    WHERE id = v_account.id;
    
    v_daily_used := 0;
  ELSE
    v_daily_used := v_account.daily_used_cents;
  END IF;

  -- Check if daily limit would be exceeded
  RETURN (v_daily_used + p_amount_cents) <= v_daily_limit;
END;
$$ LANGUAGE plpgsql;

-- Drop existing get_credit_balance function if it exists (to change return type)
DROP FUNCTION IF EXISTS get_credit_balance(UUID);

-- Update get_credit_balance function to include daily limits
CREATE FUNCTION get_credit_balance(p_user_id UUID)
RETURNS TABLE (
  account_id UUID,
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,
  allocated_cents INTEGER,
  used_cents INTEGER,
  remaining_cents INTEGER,
  percentage_used NUMERIC,
  daily_limit_cents INTEGER,
  daily_used_cents INTEGER,
  daily_remaining_cents INTEGER,
  daily_reset_at TIMESTAMPTZ
) AS $$
DECLARE
  v_account RECORD;
  v_now TIMESTAMPTZ := NOW();
  v_daily_limit INTEGER;
  v_daily_used INTEGER;
  v_daily_reset_at TIMESTAMPTZ;
BEGIN
  -- Get the current credit account
  SELECT * INTO v_account
  FROM token_credits
  WHERE user_id = p_user_id
    AND period_start <= v_now
    AND period_end >= v_now
  ORDER BY created_at DESC
  LIMIT 1;

  -- If no account found, return empty
  IF v_account IS NULL THEN
    RETURN;
  END IF;

  -- Calculate daily limit
  v_daily_limit := calculate_daily_limit(v_account.credits_allocated_cents);

  -- Check if rolling window has expired
  IF v_account.last_daily_reset_at IS NULL OR 
     (v_now - v_account.last_daily_reset_at) >= INTERVAL '24 hours' THEN
    -- Reset daily usage
    UPDATE token_credits
    SET daily_used_cents = 0,
        last_daily_reset_at = v_now
    WHERE id = v_account.id;
    
    v_daily_used := 0;
    v_daily_reset_at := v_now + INTERVAL '24 hours';
  ELSE
    v_daily_used := v_account.daily_used_cents;
    v_daily_reset_at := v_account.last_daily_reset_at + INTERVAL '24 hours';
  END IF;

  -- Return balance with daily info
  RETURN QUERY SELECT
    v_account.id,
    v_account.period_start,
    v_account.period_end,
    v_account.credits_allocated_cents,
    v_account.credits_used_cents,
    v_account.credits_remaining_cents,
    CASE 
      WHEN v_account.credits_allocated_cents > 0 THEN
        ROUND((v_account.credits_used_cents::NUMERIC / v_account.credits_allocated_cents::NUMERIC) * 100, 2)
      ELSE 0
    END,
    v_daily_limit,
    v_daily_used,
    GREATEST(0, v_daily_limit - v_daily_used),
    v_daily_reset_at;
END;
$$ LANGUAGE plpgsql;

-- Update check_credits_available to check both daily and monthly limits
CREATE OR REPLACE FUNCTION check_credits_available(
  p_user_id UUID,
  p_amount_cents INTEGER
)
RETURNS BOOLEAN AS $$
DECLARE
  v_account RECORD;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  -- Get the current credit account
  SELECT * INTO v_account
  FROM token_credits
  WHERE user_id = p_user_id
    AND period_start <= v_now
    AND period_end >= v_now
  ORDER BY created_at DESC
  LIMIT 1;

  -- If no account found, return false
  IF v_account IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Check monthly limit
  IF (v_account.credits_remaining_cents < p_amount_cents) THEN
    RETURN FALSE;
  END IF;

  -- Check daily limit (rolling 24-hour window)
  RETURN check_daily_credits_available(p_user_id, p_amount_cents);
END;
$$ LANGUAGE plpgsql;

-- Update deduct_credits to track daily usage
CREATE OR REPLACE FUNCTION deduct_credits(
  p_user_id UUID,
  p_amount_cents INTEGER,
  p_description TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB AS $$
DECLARE
  v_account RECORD;
  v_now TIMESTAMPTZ := NOW();
  v_daily_limit INTEGER;
  v_daily_used INTEGER;
  v_result JSONB;
BEGIN
  -- Get the current credit account with row lock
  SELECT * INTO v_account
  FROM token_credits
  WHERE user_id = p_user_id
    AND period_start <= v_now
    AND period_end >= v_now
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  -- If no account found
  IF v_account IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'No credit account found',
      'available', 0,
      'required', p_amount_cents
    );
  END IF;

  -- Check monthly limit
  IF v_account.credits_remaining_cents < p_amount_cents THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Insufficient monthly credits',
      'available', v_account.credits_remaining_cents,
      'required', p_amount_cents
    );
  END IF;

  -- Calculate daily limit
  v_daily_limit := calculate_daily_limit(v_account.credits_allocated_cents);

  -- Check and reset daily window if needed
  IF v_account.last_daily_reset_at IS NULL OR 
     (v_now - v_account.last_daily_reset_at) >= INTERVAL '24 hours' THEN
    v_daily_used := 0;
  ELSE
    v_daily_used := v_account.daily_used_cents;
  END IF;

  -- Check daily limit
  IF (v_daily_used + p_amount_cents) > v_daily_limit THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Daily credit limit reached',
      'code', 'DAILY_CREDIT_LIMIT_REACHED',
      'daily_limit', v_daily_limit,
      'daily_used', v_daily_used,
      'daily_remaining', GREATEST(0, v_daily_limit - v_daily_used),
      'available', v_account.credits_remaining_cents,
      'required', p_amount_cents
    );
  END IF;

  -- Deduct credits
  UPDATE token_credits
  SET credits_used_cents = credits_used_cents + p_amount_cents,
      credits_remaining_cents = credits_remaining_cents - p_amount_cents,
      daily_used_cents = v_daily_used + p_amount_cents,
      last_daily_reset_at = COALESCE(
        CASE 
          WHEN last_daily_reset_at IS NULL OR (v_now - last_daily_reset_at) >= INTERVAL '24 hours' 
          THEN v_now 
          ELSE last_daily_reset_at 
        END,
        v_now
      ),
      updated_at = v_now
  WHERE id = v_account.id;

  -- Insert transaction record
  INSERT INTO credit_transactions (
    user_id,
    credit_account_id,
    transaction_type,
    amount_cents,
    description,
    metadata
  ) VALUES (
    p_user_id,
    v_account.id,
    'deduction',
    p_amount_cents,
    p_description,
    p_metadata
  );

  -- Return success
  RETURN jsonb_build_object(
    'success', true,
    'account_id', v_account.id,
    'remaining_cents', v_account.credits_remaining_cents - p_amount_cents
  );
END;
$$ LANGUAGE plpgsql;

