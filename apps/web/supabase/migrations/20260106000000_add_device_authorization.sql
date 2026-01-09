-- Migration: Add device_authorization_codes table and fix subscriptions constraint
-- This migration addresses critical gaps identified in the system audit

-- 1. Create device_authorization_codes table (CRITICAL: API endpoints reference this but it doesn't exist)
CREATE TABLE IF NOT EXISTS public.device_authorization_codes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  device_id TEXT NOT NULL,
  device_name TEXT,
  device_type TEXT,
  user_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'authorized', 'expired', 'revoked')),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  authorized_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add unique constraint on user_code
CREATE UNIQUE INDEX IF NOT EXISTS idx_device_auth_user_code ON public.device_authorization_codes(user_code);

-- Add index for device lookup
CREATE INDEX IF NOT EXISTS idx_device_auth_device_id ON public.device_authorization_codes(device_id);

-- Add index for user lookup
CREATE INDEX IF NOT EXISTS idx_device_auth_user_id ON public.device_authorization_codes(user_id) WHERE user_id IS NOT NULL;

-- Add index for status filtering
CREATE INDEX IF NOT EXISTS idx_device_auth_status ON public.device_authorization_codes(status) WHERE status = 'pending';

-- Enable RLS
ALTER TABLE public.device_authorization_codes ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own device authorizations"
  ON public.device_authorization_codes
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage all device authorizations"
  ON public.device_authorization_codes
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 2. Add UNIQUE constraint to subscriptions.user_id (CRITICAL: onConflict requires this)
-- First check if constraint exists, then add if not
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'subscriptions_user_id_unique'
    AND conrelid = 'public.subscriptions'::regclass
  ) THEN
    ALTER TABLE public.subscriptions
    ADD CONSTRAINT subscriptions_user_id_unique UNIQUE (user_id);
  END IF;
END $$;

-- 3. Add enterprise to plan_tier check constraint
ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_plan_tier_check;
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_plan_tier_check
  CHECK (plan_tier = ANY (ARRAY['free'::text, 'hobby'::text, 'pro'::text, 'max'::text, 'enterprise'::text]));

-- 4. Create function for atomic claim-offer operation (fixes race condition)
CREATE OR REPLACE FUNCTION public.claim_beta_invite(
  p_user_id UUID,
  p_invite_id UUID,
  p_plan_tier TEXT DEFAULT 'hobby'
) RETURNS JSON AS $$
DECLARE
  v_invite RECORD;
  v_existing_redemption RECORD;
  v_existing_subscription RECORD;
  v_redemption_id UUID;
  v_subscription_id UUID;
  v_result JSON;
BEGIN
  -- Lock the invite row to prevent race conditions
  SELECT * INTO v_invite
  FROM public.beta_invites
  WHERE id = p_invite_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Invite not found');
  END IF;

  IF NOT v_invite.is_active THEN
    RETURN json_build_object('success', false, 'error', 'Invite is not active');
  END IF;

  IF v_invite.expires_at IS NOT NULL AND v_invite.expires_at < NOW() THEN
    RETURN json_build_object('success', false, 'error', 'Invite has expired');
  END IF;

  IF v_invite.max_uses IS NOT NULL AND v_invite.current_uses >= v_invite.max_uses THEN
    RETURN json_build_object('success', false, 'error', 'Invite has reached maximum uses');
  END IF;

  -- Check for existing redemption by this user
  SELECT id INTO v_existing_redemption
  FROM public.beta_redemptions
  WHERE invite_id = p_invite_id AND user_id = p_user_id;

  IF FOUND THEN
    RETURN json_build_object('success', false, 'error', 'You have already redeemed this invite');
  END IF;

  -- Check for existing subscription
  SELECT id INTO v_existing_subscription
  FROM public.subscriptions
  WHERE user_id = p_user_id AND status IN ('active', 'trialing');

  IF FOUND THEN
    RETURN json_build_object('success', false, 'error', 'You already have an active subscription');
  END IF;

  -- Create redemption record
  INSERT INTO public.beta_redemptions (invite_id, user_id)
  VALUES (p_invite_id, p_user_id)
  RETURNING id INTO v_redemption_id;

  -- Update invite usage count
  UPDATE public.beta_invites
  SET current_uses = current_uses + 1
  WHERE id = p_invite_id;

  -- Create or update subscription
  INSERT INTO public.subscriptions (
    user_id,
    plan_tier,
    status,
    current_period_start,
    current_period_end
  ) VALUES (
    p_user_id,
    p_plan_tier,
    'active',
    NOW(),
    NOW() + (v_invite.plan_duration_days || ' days')::INTERVAL
  )
  ON CONFLICT (user_id) DO UPDATE SET
    plan_tier = EXCLUDED.plan_tier,
    status = EXCLUDED.status,
    current_period_start = EXCLUDED.current_period_start,
    current_period_end = EXCLUDED.current_period_end,
    updated_at = NOW()
  RETURNING id INTO v_subscription_id;

  RETURN json_build_object(
    'success', true,
    'redemption_id', v_redemption_id,
    'subscription_id', v_subscription_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.claim_beta_invite TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_beta_invite TO service_role;

-- 5. Add function to handle refunds (credits revocation)
CREATE OR REPLACE FUNCTION public.handle_refund(
  p_user_id UUID,
  p_refund_amount_cents INTEGER,
  p_reason TEXT DEFAULT 'Refund processed'
) RETURNS BOOLEAN AS $$
DECLARE
  v_account RECORD;
  v_credits_to_revoke INTEGER;
BEGIN
  -- Get the user's credit account
  SELECT * INTO v_account
  FROM public.token_credits
  WHERE user_id = p_user_id
  ORDER BY period_end DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Calculate credits to revoke (proportional to refund)
  v_credits_to_revoke := LEAST(p_refund_amount_cents, v_account.credits_remaining_cents);

  -- Deduct credits
  UPDATE public.token_credits
  SET
    credits_remaining_cents = credits_remaining_cents - v_credits_to_revoke,
    updated_at = NOW()
  WHERE id = v_account.id;

  -- Record the transaction
  INSERT INTO public.credit_transactions (
    user_id,
    account_id,
    amount_cents,
    transaction_type,
    description
  ) VALUES (
    p_user_id,
    v_account.id,
    -v_credits_to_revoke,
    'refund',
    p_reason
  );

  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.handle_refund TO service_role;

-- Add updated_at trigger for device_authorization_codes
CREATE OR REPLACE FUNCTION public.update_device_auth_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_device_authorization_codes_updated_at
  BEFORE UPDATE ON public.device_authorization_codes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_device_auth_updated_at();
