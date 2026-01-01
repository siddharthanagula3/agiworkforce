-- 20241224000000_create_credit_tables.sql
-- Create token_credits and credit_transactions tables and fix subscriptions schema

-- 0. Fix subscriptions table (Missing 'id' column which code expects)
ALTER TABLE subscriptions
ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid();

-- Ensure 'id' is unique so it can be referenced
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'subscriptions_id_key'
    ) THEN
        ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_id_key UNIQUE (id);
    END IF;
END $$;

-- 1. Token Credits Table
CREATE TABLE IF NOT EXISTS token_credits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    -- Reference the 'id' column of subscriptions, not user_id
    subscription_id UUID REFERENCES subscriptions(id) ON DELETE CASCADE,
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL,
    credits_allocated_cents INTEGER NOT NULL DEFAULT 0,
    credits_used_cents INTEGER NOT NULL DEFAULT 0,
    credits_remaining_cents INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),

    -- Ensure only one credit account per user per period to prevent duplicates
    CONSTRAINT uq_token_credits_user_period UNIQUE (user_id, period_start, period_end)
);

CREATE INDEX IF NOT EXISTS idx_token_credits_user_id ON token_credits(user_id);
CREATE INDEX IF NOT EXISTS idx_token_credits_subscription_id_base ON token_credits(subscription_id);

-- 2. Credit Transactions Table
CREATE TABLE IF NOT EXISTS credit_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    credit_account_id UUID REFERENCES token_credits(id) ON DELETE CASCADE,
    transaction_type TEXT NOT NULL, -- 'deduction', 'allocation', 'refund'
    amount_cents INTEGER NOT NULL,
    description TEXT,
    metadata JSONB DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_id ON credit_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_account_id ON credit_transactions(credit_account_id);

-- 3. RLS Policies

ALTER TABLE token_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;

-- Token Credits Policies
CREATE POLICY "Users can view own credit balance"
ON token_credits FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Service role manages credit balances"
ON token_credits FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Credit Transactions Policies
CREATE POLICY "Users can view own transactions"
ON credit_transactions FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Service role manages transactions"
ON credit_transactions FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 4. RPC Functions

-- Get or create account using atomic INSERT ON CONFLICT
CREATE OR REPLACE FUNCTION get_or_create_credit_account(
    p_user_id UUID,
    p_subscription_id UUID,
    p_period_start TIMESTAMPTZ,
    p_period_end TIMESTAMPTZ,
    p_credits_allocated_cents INTEGER
)
RETURNS UUID AS $$
DECLARE
    v_account_id UUID;
BEGIN
    -- Try to insert new account, doing nothing if it exists (atomic)
    INSERT INTO token_credits (
        user_id,
        subscription_id,
        period_start,
        period_end,
        credits_allocated_cents,
        credits_remaining_cents
    ) VALUES (
        p_user_id,
        p_subscription_id,
        p_period_start,
        p_period_end,
        p_credits_allocated_cents,
        p_credits_allocated_cents
    )
    ON CONFLICT (user_id, period_start, period_end) DO NOTHING;

    -- Retrieve the ID (either newly inserted or existing)
    SELECT id INTO v_account_id
    FROM token_credits
    WHERE user_id = p_user_id
    AND period_start = p_period_start
    AND period_end = p_period_end;

    RETURN v_account_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Reset credits using atomic UPSERT logic
CREATE OR REPLACE FUNCTION reset_credits_for_period(
    p_user_id UUID,
    p_subscription_id UUID,
    p_period_start TIMESTAMPTZ,
    p_period_end TIMESTAMPTZ,
    p_credits_allocated_cents INTEGER
)
RETURNS UUID AS $$
DECLARE
    v_account_id UUID;
BEGIN
    -- Insert or Update (atomic)
    INSERT INTO token_credits (
        user_id,
        subscription_id,
        period_start,
        period_end,
        credits_allocated_cents,
        credits_remaining_cents
    ) VALUES (
        p_user_id,
        p_subscription_id,
        p_period_start,
        p_period_end,
        p_credits_allocated_cents,
        p_credits_allocated_cents
    )
    ON CONFLICT (user_id, period_start, period_end)
    DO UPDATE SET
        credits_allocated_cents = EXCLUDED.credits_allocated_cents,
        -- When resetting for a period (e.g. restart), we recalculate remaining
        -- assuming usage should be preserved or reset?
        -- If it's a NEW period, it's a NEW row (handled by Insert).
        -- If it's the SAME period (retry), we just update allocation.
        -- We'll keep usage as is.
        credits_remaining_cents = GREATEST(0, EXCLUDED.credits_allocated_cents - token_credits.credits_used_cents),
        updated_at = now()
    RETURNING id INTO v_account_id;

    RETURN v_account_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
