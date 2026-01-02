-- 20260101000000_consolidated_schema.sql
-- Consolidated schema migration

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Profiles (Depends on auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid NOT NULL,
  email text,
  display_name text,
  avatar_url text,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT profiles_pkey PRIMARY KEY (id),
  CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id)
);

-- 2. Organizations
CREATE TABLE IF NOT EXISTS public.organizations (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  CONSTRAINT organizations_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.organization_members (
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  joined_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  CONSTRAINT organization_members_pkey PRIMARY KEY (organization_id, user_id)
);

-- 3. Pricing Plans (Independent)
CREATE TABLE IF NOT EXISTS public.pricing_plans (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  stripe_product_id text,
  stripe_price_id text UNIQUE,
  name text NOT NULL,
  tier text NOT NULL CHECK (tier IN ('free', 'hobby', 'pro', 'max')),
  price_cents integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'usd'::text,
  interval text CHECK ("interval" = ANY (ARRAY['month'::text, 'year'::text, 'one_time'::text])),
  features jsonb DEFAULT '[]'::jsonb,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  monthly_credits_cents integer DEFAULT 0,
  stripe_coupon_id text,
  CONSTRAINT pricing_plans_pkey PRIMARY KEY (id)
);

-- 4. Subscriptions (Depends on Profiles)
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id uuid NOT NULL DEFAULT uuid_generate_v4() UNIQUE,
  user_id uuid NOT NULL,
  stripe_customer_id text UNIQUE,
  stripe_subscription_id text UNIQUE,
  stripe_price_id text,
  plan_tier text NOT NULL DEFAULT 'free'::text CHECK (plan_tier = ANY (ARRAY['free'::text, 'hobby'::text, 'pro'::text, 'max'::text])),
  status text NOT NULL DEFAULT 'active'::text CHECK (status = ANY (ARRAY['active'::text, 'trialing'::text, 'past_due'::text, 'canceled'::text, 'incomplete'::text, 'incomplete_expired'::text, 'unpaid'::text])),
  current_period_start timestamp with time zone,
  current_period_end timestamp with time zone,
  cancel_at_period_end boolean DEFAULT false,
  canceled_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  stripe_coupon_id text,
  CONSTRAINT subscriptions_pkey PRIMARY KEY (id),
  CONSTRAINT subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id)
);

-- 5. Token Credits (Depends on Subscriptions, Users)
CREATE TABLE IF NOT EXISTS public.token_credits (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  subscription_id uuid,
  period_start timestamp with time zone NOT NULL,
  period_end timestamp with time zone NOT NULL,
  credits_allocated_cents integer NOT NULL DEFAULT 0,
  credits_used_cents integer NOT NULL DEFAULT 0,
  credits_remaining_cents integer NOT NULL DEFAULT 0 CHECK (credits_remaining_cents >= 0),
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  daily_used_cents integer DEFAULT 0,
  last_daily_reset_at timestamp with time zone,
  CONSTRAINT token_credits_pkey PRIMARY KEY (id),
  CONSTRAINT token_credits_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT token_credits_subscription_id_fkey FOREIGN KEY (subscription_id) REFERENCES public.subscriptions(id)
);

-- 6. Credit Transactions (Depends on Token Credits, Users)
CREATE TABLE IF NOT EXISTS public.credit_transactions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  credit_account_id uuid,
  transaction_type text NOT NULL CHECK (transaction_type = ANY (ARRAY['allocation'::text, 'deduction'::text, 'reset'::text, 'refund'::text])),
  amount_cents integer NOT NULL,
  description text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT credit_transactions_pkey PRIMARY KEY (id),
  CONSTRAINT credit_transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT credit_transactions_credit_account_id_fkey FOREIGN KEY (credit_account_id) REFERENCES public.token_credits(id)
);

-- 7. Beta Invites (Depends on Profiles)
CREATE TABLE IF NOT EXISTS public.beta_invites (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  code text NOT NULL UNIQUE,
  email text,
  max_uses integer DEFAULT 1,
  current_uses integer DEFAULT 0,
  plan_tier text NOT NULL DEFAULT 'hobby'::text CHECK (plan_tier = ANY (ARRAY['free'::text, 'pro'::text, 'hobby'::text])),
  trial_days integer DEFAULT 90,
  discount_percent integer DEFAULT 50 CHECK (discount_percent >= 0 AND discount_percent <= 100),
  stripe_coupon_id text,
  expires_at timestamp with time zone,
  is_active boolean DEFAULT true,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT beta_invites_pkey PRIMARY KEY (id),
  CONSTRAINT beta_invites_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id)
);

-- 8. Beta Redemptions (Depends on Beta Invites, Profiles)
CREATE TABLE IF NOT EXISTS public.beta_redemptions (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  invite_id uuid NOT NULL,
  user_id uuid NOT NULL,
  redeemed_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT beta_redemptions_pkey PRIMARY KEY (id),
  CONSTRAINT beta_redemptions_invite_id_fkey FOREIGN KEY (invite_id) REFERENCES public.beta_invites(id),
  CONSTRAINT beta_redemptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id)
);

-- 9. Email Campaigns
CREATE TABLE IF NOT EXISTS public.email_campaigns (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  subject text NOT NULL,
  preview_text text,
  template_id text,
  segment text NOT NULL DEFAULT 'all'::text CHECK (segment = ANY (ARRAY['all'::text, 'waitlist'::text, 'beta'::text, 'free'::text, 'pro'::text, 'churned'::text])),
  status text NOT NULL DEFAULT 'draft'::text CHECK (status = ANY (ARRAY['draft'::text, 'scheduled'::text, 'sending'::text, 'sent'::text, 'cancelled'::text])),
  scheduled_at timestamp with time zone,
  sent_at timestamp with time zone,
  total_recipients integer DEFAULT 0,
  total_sent integer DEFAULT 0,
  total_opened integer DEFAULT 0,
  total_clicked integer DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT email_campaigns_pkey PRIMARY KEY (id)
);

-- 10. Email Preferences (Depends on Profiles)
CREATE TABLE IF NOT EXISTS public.email_preferences (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid,
  email text NOT NULL UNIQUE,
  marketing_emails boolean DEFAULT false,
  product_updates boolean DEFAULT true,
  security_alerts boolean DEFAULT true,
  weekly_digest boolean DEFAULT false,
  consent_given_at timestamp with time zone,
  consent_ip_address text,
  unsubscribe_token text DEFAULT encode(gen_random_bytes(32), 'hex'::text) UNIQUE,
  unsubscribed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT email_preferences_pkey PRIMARY KEY (id),
  CONSTRAINT email_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id)
);

-- 11. Email Sends (Depends on Campaign, Profiles)
CREATE TABLE IF NOT EXISTS public.email_sends (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  campaign_id uuid,
  email text NOT NULL,
  user_id uuid,
  status text NOT NULL DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'sent'::text, 'delivered'::text, 'bounced'::text, 'failed'::text])),
  sent_at timestamp with time zone,
  delivered_at timestamp with time zone,
  opened_at timestamp with time zone,
  clicked_at timestamp with time zone,
  bounce_reason text,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT email_sends_pkey PRIMARY KEY (id),
  CONSTRAINT email_sends_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.email_campaigns(id),
  CONSTRAINT email_sends_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id)
);

-- 12. Feature Flags (Depends on Profiles)
CREATE TABLE IF NOT EXISTS public.feature_flags (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL,
  flag_name text NOT NULL,
  enabled boolean DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT feature_flags_pkey PRIMARY KEY (id),
  CONSTRAINT feature_flags_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id)
);

-- 13. Feedback (Depends on Profiles)
CREATE TABLE IF NOT EXISTS public.feedback (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  subject text NOT NULL,
  message text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT feedback_pkey PRIMARY KEY (id),
  CONSTRAINT feedback_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id)
);

-- 14. Referrals (Depends on Profiles)
CREATE TABLE IF NOT EXISTS public.referrals (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  referrer_id uuid NOT NULL,
  referral_code text NOT NULL UNIQUE,
  referred_email text,
  referred_user_id uuid,
  status text NOT NULL DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'signed_up'::text, 'converted'::text, 'rewarded'::text])),
  reward_type text,
  reward_amount integer,
  reward_issued_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT referrals_pkey PRIMARY KEY (id),
  CONSTRAINT referrals_referrer_id_fkey FOREIGN KEY (referrer_id) REFERENCES public.profiles(id),
  CONSTRAINT referrals_referred_user_id_fkey FOREIGN KEY (referred_user_id) REFERENCES public.profiles(id)
);

-- 15. Usage Events (Depends on Profiles)
CREATE TABLE IF NOT EXISTS public.usage_events (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL,
  event_type text NOT NULL,
  quantity integer DEFAULT 1,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT usage_events_pkey PRIMARY KEY (id),
  CONSTRAINT usage_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id)
);

-- 16. Waitlist
CREATE TABLE IF NOT EXISTS public.waitlist (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  email text NOT NULL UNIQUE,
  name text,
  company text,
  role text,
  use_case text,
  referral_source text,
  referral_code text,
  ip_address text,
  user_agent text,
  marketing_consent boolean DEFAULT false,
  status text NOT NULL DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'invited'::text, 'converted'::text, 'unsubscribed'::text])),
  invited_at timestamp with time zone,
  converted_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT waitlist_pkey PRIMARY KEY (id)
);

-- 17. API Keys
CREATE TABLE IF NOT EXISTS public.api_keys (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  key_hash text NOT NULL,
  scopes text[] DEFAULT '{}',
  last_used_at timestamp with time zone,
  expires_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  CONSTRAINT api_keys_pkey PRIMARY KEY (id)
);

-- 18. Audit Logs
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  organization_id uuid REFERENCES public.organizations(id),
  user_id uuid REFERENCES public.profiles(id),
  action text NOT NULL,
  resource text NOT NULL,
  resource_id text,
  metadata jsonb DEFAULT '{}',
  ip_address text,
  user_agent text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  CONSTRAINT audit_logs_pkey PRIMARY KEY (id)
);

-- 19. Notifications
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  message text,
  type text CHECK (type IN ('info', 'success', 'warning', 'error')),
  link text,
  is_read boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  CONSTRAINT notifications_pkey PRIMARY KEY (id)
);

-- 20. Signaling Sessions (for WebSocket pairing between desktop and mobile)
CREATE TABLE IF NOT EXISTS public.signaling_sessions (
  code text NOT NULL,
  created_at bigint NOT NULL,
  expires_at bigint NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  CONSTRAINT signaling_sessions_pkey PRIMARY KEY (code)
);

-- Index for efficient cleanup of expired sessions
CREATE INDEX IF NOT EXISTS idx_signaling_sessions_expires_at
  ON public.signaling_sessions(expires_at);

-- RLS for signaling_sessions (service role only)
ALTER TABLE public.signaling_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage signaling sessions"
  ON public.signaling_sessions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- =============================================================================
-- 21. Processed Stripe Events (for webhook idempotency)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.processed_stripe_events (
  event_id text NOT NULL,
  processed_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT processed_stripe_events_pkey PRIMARY KEY (event_id)
);

-- =============================================================================
-- INDEXES FOR PERFORMANCE
-- =============================================================================

-- Token credits indexes
CREATE INDEX IF NOT EXISTS idx_token_credits_user_id ON public.token_credits(user_id);
CREATE INDEX IF NOT EXISTS idx_token_credits_subscription_id ON public.token_credits(subscription_id);
CREATE INDEX IF NOT EXISTS idx_token_credits_period ON public.token_credits(period_start, period_end);

-- Credit transactions indexes
CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_id ON public.credit_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_account_id ON public.credit_transactions(credit_account_id);

-- Subscriptions indexes
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON public.subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON public.subscriptions(status);

-- =============================================================================
-- ROW LEVEL SECURITY POLICIES
-- =============================================================================

-- Profiles RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Service role has full access to profiles"
  ON public.profiles FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Subscriptions RLS
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own subscription"
  ON public.subscriptions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR user_id IN (
    SELECT id FROM public.profiles WHERE id = auth.uid()
  ));

CREATE POLICY "Service role manages subscriptions"
  ON public.subscriptions FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Token Credits RLS
ALTER TABLE public.token_credits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own credits"
  ON public.token_credits FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Service role manages credits"
  ON public.token_credits FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Credit Transactions RLS
ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own transactions"
  ON public.credit_transactions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Service role manages transactions"
  ON public.credit_transactions FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Processed Stripe Events RLS (service role only)
ALTER TABLE public.processed_stripe_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages stripe events"
  ON public.processed_stripe_events FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- =============================================================================
-- RPC FUNCTIONS FOR CREDIT MANAGEMENT
-- Updated: 2026-01-01
-- =============================================================================

-- Helper function: Calculate daily limit (30% of monthly)
CREATE OR REPLACE FUNCTION public.calculate_daily_limit(monthly_cents INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN FLOOR(monthly_cents * 0.30);
END;
$$;

-- Get credit balance for a user (with daily tracking)
CREATE OR REPLACE FUNCTION public.get_credit_balance(p_user_id UUID)
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
  -- Get the most recent active credit account
  SELECT tc.* INTO v_account
  FROM public.token_credits tc
  WHERE tc.user_id = p_user_id
    AND tc.period_end > NOW()
  ORDER BY tc.period_end DESC
  LIMIT 1;

  -- If no account found, return zeros
  IF v_account IS NULL THEN
    RETURN QUERY SELECT
      NULL::UUID,
      0, 0, 0, 0, 0, 0,
      NULL::TIMESTAMPTZ, NULL::TIMESTAMPTZ, NULL::TIMESTAMPTZ;
    RETURN;
  END IF;

  -- Calculate daily limit
  v_daily_limit := calculate_daily_limit(v_account.credits_allocated_cents);

  -- Check if daily reset is needed (24-hour rolling window)
  v_needs_reset := v_account.last_daily_reset_at IS NULL
    OR v_account.last_daily_reset_at < NOW() - INTERVAL '24 hours';

  IF v_needs_reset THEN
    -- Reset daily usage
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

-- Check if user has sufficient credits (both daily and monthly)
CREATE OR REPLACE FUNCTION public.check_credits_available(
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
  SELECT * INTO v_balance
  FROM public.get_credit_balance(p_user_id);

  -- Check monthly limit
  IF v_balance.credits_remaining_cents < p_amount_cents THEN
    RETURN FALSE;
  END IF;

  -- Check daily limit
  IF v_balance.daily_remaining_cents < p_amount_cents THEN
    RETURN FALSE;
  END IF;

  RETURN TRUE;
END;
$$;

-- Deduct credits with atomic transaction and daily tracking
CREATE OR REPLACE FUNCTION public.deduct_credits(
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
  -- Get the active credit account with lock
  SELECT tc.* INTO v_account
  FROM public.token_credits tc
  WHERE tc.user_id = p_user_id
    AND tc.period_end > NOW()
  ORDER BY tc.period_end DESC
  LIMIT 1
  FOR UPDATE;

  -- No account found
  IF v_account IS NULL THEN
    RETURN QUERY SELECT
      FALSE, 0, 'No active credit account found'::TEXT, 'NO_ACCOUNT'::TEXT,
      0, 0, 0, 0::NUMERIC;
    RETURN;
  END IF;

  -- Calculate daily limit
  v_daily_limit := calculate_daily_limit(v_account.credits_allocated_cents);

  -- Check if daily reset is needed
  v_needs_reset := v_account.last_daily_reset_at IS NULL
    OR v_account.last_daily_reset_at < NOW() - INTERVAL '24 hours';

  IF v_needs_reset THEN
    UPDATE public.token_credits
    SET daily_used_cents = 0,
        last_daily_reset_at = NOW(),
        updated_at = NOW()
    WHERE id = v_account.id;

    v_account.daily_used_cents := 0;
    v_account.last_daily_reset_at := NOW();
  END IF;

  -- Calculate hours until daily reset
  v_hours_until_reset := EXTRACT(EPOCH FROM
    (v_account.last_daily_reset_at + INTERVAL '24 hours' - NOW())
  ) / 3600;

  -- Check daily limit
  IF COALESCE(v_account.daily_used_cents, 0) + p_amount_cents > v_daily_limit THEN
    RETURN QUERY SELECT
      FALSE,
      v_account.credits_remaining_cents,
      'Daily credit limit exceeded'::TEXT,
      'DAILY_CREDIT_LIMIT_REACHED'::TEXT,
      v_daily_limit,
      COALESCE(v_account.daily_used_cents, 0),
      GREATEST(0, v_daily_limit - COALESCE(v_account.daily_used_cents, 0)),
      GREATEST(0, v_hours_until_reset);
    RETURN;
  END IF;

  -- Check monthly limit
  IF v_account.credits_remaining_cents < p_amount_cents THEN
    RETURN QUERY SELECT
      FALSE,
      v_account.credits_remaining_cents,
      'Monthly credit limit exceeded'::TEXT,
      'MONTHLY_CREDIT_LIMIT_REACHED'::TEXT,
      v_daily_limit,
      COALESCE(v_account.daily_used_cents, 0),
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

  -- Log the transaction
  INSERT INTO public.credit_transactions (
    user_id, credit_account_id, transaction_type, amount_cents, description, metadata
  ) VALUES (
    p_user_id, v_account.id, 'deduction', p_amount_cents, p_description, p_metadata
  );

  RETURN QUERY SELECT
    TRUE,
    v_account.credits_remaining_cents - p_amount_cents,
    NULL::TEXT,
    NULL::TEXT,
    v_daily_limit,
    COALESCE(v_account.daily_used_cents, 0) + p_amount_cents,
    GREATEST(0, v_daily_limit - COALESCE(v_account.daily_used_cents, 0) - p_amount_cents),
    GREATEST(0, v_hours_until_reset);
END;
$$;

-- Get or create credit account for a billing period
CREATE OR REPLACE FUNCTION public.get_or_create_credit_account(
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
  -- Try to find existing account for this period
  SELECT id INTO v_account_id
  FROM public.token_credits
  WHERE user_id = p_user_id
    AND subscription_id = p_subscription_id
    AND period_start = p_period_start
    AND period_end = p_period_end;

  IF v_account_id IS NOT NULL THEN
    RETURN v_account_id;
  END IF;

  -- Create new account
  INSERT INTO public.token_credits (
    user_id,
    subscription_id,
    period_start,
    period_end,
    credits_allocated_cents,
    credits_remaining_cents,
    daily_used_cents,
    last_daily_reset_at
  ) VALUES (
    p_user_id,
    p_subscription_id,
    p_period_start,
    p_period_end,
    p_credits_allocated_cents,
    p_credits_allocated_cents,
    0,
    NOW()
  )
  RETURNING id INTO v_account_id;

  -- Log the allocation
  INSERT INTO public.credit_transactions (
    user_id, credit_account_id, transaction_type, amount_cents, description
  ) VALUES (
    p_user_id, v_account_id, 'allocation', p_credits_allocated_cents,
    'Initial credit allocation for billing period'
  );

  RETURN v_account_id;
END;
$$;

-- Reset credits for a new billing period
CREATE OR REPLACE FUNCTION public.reset_credits_for_period(
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
  -- Use upsert to handle the new period
  INSERT INTO public.token_credits (
    user_id,
    subscription_id,
    period_start,
    period_end,
    credits_allocated_cents,
    credits_used_cents,
    credits_remaining_cents,
    daily_used_cents,
    last_daily_reset_at
  ) VALUES (
    p_user_id,
    p_subscription_id,
    p_period_start,
    p_period_end,
    p_credits_allocated_cents,
    0,
    p_credits_allocated_cents,
    0,
    NOW()
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

  -- Log the reset
  INSERT INTO public.credit_transactions (
    user_id, credit_account_id, transaction_type, amount_cents, description
  ) VALUES (
    p_user_id, v_account_id, 'reset', p_credits_allocated_cents,
    'Credit reset for new billing period'
  );

  RETURN v_account_id;
END;
$$;

-- Unique constraint for credit period (needed for upsert in reset_credits_for_period)
CREATE UNIQUE INDEX IF NOT EXISTS idx_token_credits_unique_period
  ON public.token_credits(user_id, subscription_id, period_start, period_end);

-- =============================================================================
-- TRIGGER: Auto-create profile on user signup
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

-- Create the trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
