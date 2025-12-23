-- 20241223_init.sql
-- Schema for Device Auth and Subscriptions

-- 1. Device Authorization Codes
CREATE TABLE IF NOT EXISTS device_authorization_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id TEXT NOT NULL,
    device_name TEXT,
    device_type TEXT,
    user_code TEXT NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    user_email TEXT, -- Cache for display
    user_name TEXT,  -- Cache for display
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied')),
    access_token TEXT,  -- Encrypted or short-lived token generated upon approval
    refresh_token TEXT, -- Encrypted refresh token
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_device_codes_device_id ON device_authorization_codes(device_id);
CREATE INDEX IF NOT EXISTS idx_device_codes_user_code ON device_authorization_codes(user_code);

-- 2. Subscriptions (Stripe Sync)
CREATE TABLE IF NOT EXISTS subscriptions (
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    status TEXT CHECK (status IN ('active', 'trialing', 'past_due', 'canceled', 'unpaid', 'incomplete', 'incomplete_expired', 'paused')),
    plan_tier TEXT DEFAULT 'free',
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
    stripe_price_id TEXT,
    stripe_coupon_id TEXT,
    current_period_start TIMESTAMPTZ,
    current_period_end TIMESTAMPTZ,
    cancel_at_period_end BOOLEAN DEFAULT false,
    canceled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_cust ON subscriptions(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_sub ON subscriptions(stripe_subscription_id);

-- 3. RLS Policies (Enable as needed)
ALTER TABLE device_authorization_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- Device Codes: Public create (for device), User read/update (web approval)
CREATE POLICY "Devices can create codes" ON device_authorization_codes FOR INSERT WITH CHECK (true);
CREATE POLICY "Device can read own code" ON device_authorization_codes FOR SELECT USING (true); -- Ideally restricted by ID but polling is public
CREATE POLICY "Users can update own codes" ON device_authorization_codes FOR UPDATE USING (auth.uid() = user_id);

-- Subscriptions: Service Role only for writes (Webhook), Users read own
CREATE POLICY "Users can view own subscription" ON subscriptions FOR SELECT USING (auth.uid() = user_id);
-- Service role bypasses RLS, so no specific write policy needed if using service_role client.
