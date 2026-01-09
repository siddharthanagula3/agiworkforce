-- Fix claim_beta_invite RPC: correct schema usage + enforce authorization + tighten EXECUTE grants.

CREATE OR REPLACE FUNCTION public.claim_beta_invite(
  p_user_id uuid,
  p_invite_id uuid,
  p_plan_tier text DEFAULT 'hobby'::text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_invite RECORD;
  v_any_redemption RECORD;
  v_existing_subscription RECORD;
  v_redemption_id UUID;
  v_subscription_id UUID;
  v_plan_tier TEXT;
  v_trial_days INTEGER;
BEGIN
  -- Authorization: authenticated users may only claim for themselves; service_role may act on any user.
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
      RETURN json_build_object('success', false, 'error', 'Not authorized');
    END IF;
  END IF;

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

  -- Enforce one-offer-per-user across ALL invites
  SELECT id INTO v_any_redemption
  FROM public.beta_redemptions
  WHERE user_id = p_user_id
  LIMIT 1;

  IF FOUND THEN
    RETURN json_build_object('success', false, 'error', 'You have already claimed an offer');
  END IF;

  -- Block if user already has an active/trialing subscription
  SELECT id INTO v_existing_subscription
  FROM public.subscriptions
  WHERE user_id = p_user_id
    AND status IN ('active', 'trialing', 'past_due')
    AND plan_tier <> 'free'
  LIMIT 1;

  IF FOUND THEN
    RETURN json_build_object('success', false, 'error', 'You already have an active subscription');
  END IF;

  v_plan_tier := COALESCE(v_invite.plan_tier, p_plan_tier, 'hobby');
  v_trial_days := COALESCE(v_invite.trial_days, 0);

  -- Create redemption record
  INSERT INTO public.beta_redemptions (invite_id, user_id)
  VALUES (p_invite_id, p_user_id)
  RETURNING id INTO v_redemption_id;

  -- Update invite usage count
  UPDATE public.beta_invites
  SET current_uses = current_uses + 1
  WHERE id = p_invite_id;

  -- Create or update subscription as trialing
  INSERT INTO public.subscriptions (
    user_id,
    plan_tier,
    status,
    current_period_start,
    current_period_end,
    stripe_coupon_id,
    updated_at
  ) VALUES (
    p_user_id,
    v_plan_tier,
    'trialing',
    NOW(),
    NOW() + (v_trial_days || ' days')::INTERVAL,
    v_invite.stripe_coupon_id,
    NOW()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    plan_tier = EXCLUDED.plan_tier,
    status = EXCLUDED.status,
    current_period_start = EXCLUDED.current_period_start,
    current_period_end = EXCLUDED.current_period_end,
    stripe_coupon_id = EXCLUDED.stripe_coupon_id,
    updated_at = NOW()
  RETURNING id INTO v_subscription_id;

  RETURN json_build_object(
    'success', true,
    'redemption_id', v_redemption_id,
    'subscription_id', v_subscription_id,
    'plan_tier', v_plan_tier,
    'trial_days', v_trial_days,
    'discount_percent', v_invite.discount_percent,
    'stripe_coupon_id', v_invite.stripe_coupon_id
  );
END;
$$;

-- Tighten EXECUTE grants (no PUBLIC/anon)
REVOKE ALL ON FUNCTION public.claim_beta_invite(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_beta_invite(uuid, uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.claim_beta_invite(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_beta_invite(uuid, uuid, text) TO service_role;


