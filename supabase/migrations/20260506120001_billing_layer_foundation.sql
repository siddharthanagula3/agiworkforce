-- 20260506120001_billing_layer_foundation.sql
-- Backfill: ensure the billing foundation tables and RPCs exist in the canonical
-- migration path. All statements use IF NOT EXISTS so this is safe to apply to
-- a database that was previously provisioned from the legacy
-- apps/web/supabase/migrations/ path.
--
-- Tables added here:
--   profiles, subscriptions, token_credits, credit_transactions
--
-- RPCs added here:
--   add_credits, handle_refund
--
-- These were previously only present in the legacy migration directory and were
-- referenced (but never created) by 20260505000006_stripe_integration.sql.

-- =============================================================================
-- 1. profiles (auth.users shadow table)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid NOT NULL,
  email text,
  display_name text,
  avatar_url text,
  stripe_customer_id text,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT profiles_pkey PRIMARY KEY (id),
  CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_stripe_customer_id
  ON public.profiles(stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'profiles' AND policyname = 'Users can view own profile'
  ) THEN
    CREATE POLICY "Users can view own profile"
      ON public.profiles FOR SELECT
      USING (auth.uid() = id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'profiles' AND policyname = 'Users can update own profile'
  ) THEN
    CREATE POLICY "Users can update own profile"
      ON public.profiles FOR UPDATE
      USING (auth.uid() = id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'profiles' AND policyname = 'Service role manages profiles'
  ) THEN
    CREATE POLICY "Service role manages profiles"
      ON public.profiles FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- =============================================================================
-- 2. subscriptions
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  user_id uuid NOT NULL,
  stripe_customer_id text UNIQUE,
  stripe_subscription_id text UNIQUE,
  stripe_price_id text,
  plan_tier text NOT NULL DEFAULT 'free'
    CHECK (plan_tier = ANY (ARRAY['free', 'hobby', 'pro', 'max'])),
  status text NOT NULL DEFAULT 'active'
    CHECK (status = ANY (ARRAY[
      'active', 'trialing', 'past_due', 'canceled',
      'incomplete', 'incomplete_expired', 'unpaid'
    ])),
  current_period_start timestamp with time zone,
  current_period_end timestamp with time zone,
  cancel_at_period_end boolean DEFAULT false,
  canceled_at timestamp with time zone,
  stripe_coupon_id text,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT subscriptions_pkey PRIMARY KEY (id),
  CONSTRAINT subscriptions_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES public.profiles(id)
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON public.subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer_id
  ON public.subscriptions(stripe_customer_id);

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'subscriptions' AND policyname = 'Users can view own subscription'
  ) THEN
    CREATE POLICY "Users can view own subscription"
      ON public.subscriptions FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'subscriptions' AND policyname = 'Service role manages subscriptions'
  ) THEN
    CREATE POLICY "Service role manages subscriptions"
      ON public.subscriptions FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- =============================================================================
-- 3. token_credits
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.token_credits (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  subscription_id uuid,
  period_start timestamp with time zone NOT NULL,
  period_end timestamp with time zone NOT NULL,
  credits_allocated_cents integer NOT NULL DEFAULT 0,
  credits_used_cents integer NOT NULL DEFAULT 0,
  credits_remaining_cents integer NOT NULL DEFAULT 0
    CHECK (credits_remaining_cents >= 0),
  daily_used_cents integer DEFAULT 0,
  last_daily_reset_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT token_credits_pkey PRIMARY KEY (id),
  CONSTRAINT token_credits_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES auth.users(id),
  CONSTRAINT token_credits_subscription_id_fkey FOREIGN KEY (subscription_id)
    REFERENCES public.subscriptions(id)
);

CREATE INDEX IF NOT EXISTS idx_token_credits_user_id ON public.token_credits(user_id);
CREATE INDEX IF NOT EXISTS idx_token_credits_subscription_id
  ON public.token_credits(subscription_id);
CREATE INDEX IF NOT EXISTS idx_token_credits_period
  ON public.token_credits(period_start, period_end);

ALTER TABLE public.token_credits ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'token_credits' AND policyname = 'Users can view own credits'
  ) THEN
    CREATE POLICY "Users can view own credits"
      ON public.token_credits FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'token_credits' AND policyname = 'Service role manages credits'
  ) THEN
    CREATE POLICY "Service role manages credits"
      ON public.token_credits FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- =============================================================================
-- 4. credit_transactions
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.credit_transactions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  credit_account_id uuid,
  transaction_type text NOT NULL
    CHECK (transaction_type = ANY (ARRAY[
      'allocation', 'deduction', 'reset', 'refund', 'purchase', 'adjustment', 'bonus'
    ])),
  amount_cents integer NOT NULL,
  description text,
  metadata jsonb DEFAULT '{}',
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT credit_transactions_pkey PRIMARY KEY (id),
  CONSTRAINT credit_transactions_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES auth.users(id),
  CONSTRAINT credit_transactions_credit_account_id_fkey FOREIGN KEY (credit_account_id)
    REFERENCES public.token_credits(id)
);

CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_id
  ON public.credit_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_account_id
  ON public.credit_transactions(credit_account_id);

ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'credit_transactions'
      AND policyname = 'Users can view own transactions'
  ) THEN
    CREATE POLICY "Users can view own transactions"
      ON public.credit_transactions FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'credit_transactions'
      AND policyname = 'Service role manages transactions'
  ) THEN
    CREATE POLICY "Service role manages transactions"
      ON public.credit_transactions FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- =============================================================================
-- 5. add_credits RPC
-- Called by stripe-webhook on checkout.session.completed (credit top-up).
-- Only service_role may invoke it.
-- =============================================================================
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
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_amount_cents <= 0 THEN
    RAISE EXCEPTION 'Credit amount must be positive';
  END IF;

  IF p_transaction_type NOT IN ('purchase', 'adjustment', 'refund', 'bonus') THEN
    RAISE EXCEPTION 'Invalid transaction type';
  END IF;

  UPDATE public.token_credits
  SET
    credits_allocated_cents = credits_allocated_cents + p_amount_cents,
    credits_remaining_cents = credits_remaining_cents + p_amount_cents,
    updated_at = now()
  WHERE id = p_account_id AND user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Credit account not found for user';
  END IF;

  INSERT INTO public.credit_transactions (
    user_id, credit_account_id, amount_cents, transaction_type, description
  ) VALUES (
    p_user_id, p_account_id, p_amount_cents, p_transaction_type, p_description
  );
END;
$$;

REVOKE ALL ON FUNCTION public.add_credits(uuid, uuid, integer, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_credits(uuid, uuid, integer, text, text) TO service_role;

-- =============================================================================
-- 6. handle_refund RPC
-- Called by stripe-webhook on charge.refunded.
-- Only service_role may invoke it.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.handle_refund(
  p_user_id uuid,
  p_refund_amount_cents integer,
  p_reason text DEFAULT 'Refund processed'
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_account record;
  v_credits_to_revoke integer;
BEGIN
  SELECT * INTO v_account
  FROM public.token_credits
  WHERE user_id = p_user_id
  ORDER BY period_end DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  v_credits_to_revoke := LEAST(p_refund_amount_cents, v_account.credits_remaining_cents);

  UPDATE public.token_credits
  SET
    credits_remaining_cents = credits_remaining_cents - v_credits_to_revoke,
    updated_at = NOW()
  WHERE id = v_account.id;

  INSERT INTO public.credit_transactions (
    user_id, credit_account_id, amount_cents, transaction_type, description
  ) VALUES (
    p_user_id, v_account.id, -v_credits_to_revoke, 'refund', p_reason
  );

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_refund(uuid, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_refund(uuid, integer, text) TO service_role;
