-- Migration: Comprehensive database cleanup and security fixes
-- Addresses:
-- 1. Duplicate indexes
-- 2. Duplicate RLS policies
-- 3. Unused redundant table
-- 4. Missing service_role RLS policy for beta_redemptions

-- =============================================================================
-- 1. Drop duplicate index on device_authorization_codes
-- The unique constraint (device_authorization_codes_user_code_key) already provides the index
-- =============================================================================
DROP INDEX IF EXISTS public.idx_device_auth_user_code;

-- =============================================================================
-- 2. Clean up duplicate RLS policies on credit_transactions
-- Keep only one service_role policy
-- =============================================================================
DROP POLICY IF EXISTS "Service role can manage credit transactions" ON public.credit_transactions;
-- Keep "Service role manages transactions" as the primary policy

-- =============================================================================
-- 3. Clean up duplicate RLS policies on subscriptions
-- Keep only one service_role policy
-- =============================================================================
DROP POLICY IF EXISTS "Service role can manage subscriptions" ON public.subscriptions;
-- Keep "Service role manages subscriptions" as the primary policy

-- =============================================================================
-- 4. Clean up duplicate RLS policies on token_credits
-- Keep only one service_role policy
-- =============================================================================
DROP POLICY IF EXISTS "Service role can manage token credits" ON public.token_credits;
DROP POLICY IF EXISTS "Service role manages credit balances" ON public.token_credits;
-- Keep "Service role manages credits" as the primary policy

-- =============================================================================
-- 5. Clean up duplicate RLS policy on profiles
-- The "Service role can update stripe fields" is redundant with "Service role has full access"
-- =============================================================================
DROP POLICY IF EXISTS "Service role can update stripe fields" ON public.profiles;
-- Keep "Service role has full access to profiles" as the primary policy

-- =============================================================================
-- 6. Drop unused public.users table
-- This table is empty and redundant - auth.users + profiles is the correct pattern
-- =============================================================================
DROP TABLE IF EXISTS public.users;

-- =============================================================================
-- 7. Add missing service_role INSERT policy for beta_redemptions
-- Required for the claim_beta_invite RPC function to work properly
-- =============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'beta_redemptions'
      AND policyname = 'Service role can manage beta redemptions'
  ) THEN
    CREATE POLICY "Service role can manage beta redemptions"
      ON public.beta_redemptions
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- =============================================================================
-- 8. Add missing service_role policy for feature_flags
-- Required for admin operations
-- =============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'feature_flags'
      AND policyname = 'Service role can manage feature flags'
  ) THEN
    CREATE POLICY "Service role can manage feature flags"
      ON public.feature_flags
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- =============================================================================
-- 9. Add missing service_role policy for usage_events
-- Required for analytics and tracking
-- =============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'usage_events'
      AND policyname = 'Service role can manage usage events'
  ) THEN
    CREATE POLICY "Service role can manage usage events"
      ON public.usage_events
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- =============================================================================
-- 10. Add missing service_role policy for referrals
-- Required for admin operations
-- =============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'referrals'
      AND policyname = 'Service role can manage referrals'
  ) THEN
    CREATE POLICY "Service role can manage referrals"
      ON public.referrals
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- =============================================================================
-- 11. Add missing service_role policy for email_preferences
-- Required for email system operations
-- =============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'email_preferences'
      AND policyname = 'Service role can manage email preferences'
  ) THEN
    CREATE POLICY "Service role can manage email preferences"
      ON public.email_preferences
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- =============================================================================
-- 12. Add missing service_role policy for pricing_plans
-- Required for admin price management
-- =============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'pricing_plans'
      AND policyname = 'Service role can manage pricing plans'
  ) THEN
    CREATE POLICY "Service role can manage pricing plans"
      ON public.pricing_plans
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- =============================================================================
-- Analyze tables to update statistics after policy changes
-- =============================================================================
ANALYZE public.credit_transactions;
ANALYZE public.subscriptions;
ANALYZE public.token_credits;
ANALYZE public.profiles;
ANALYZE public.device_authorization_codes;
ANALYZE public.beta_redemptions;
ANALYZE public.feature_flags;
ANALYZE public.usage_events;
ANALYZE public.referrals;
ANALYZE public.email_preferences;
ANALYZE public.pricing_plans;

-- =============================================================================
-- NOTES ON INTENTIONAL PERMISSIVE POLICIES (NOT CHANGED):
--
-- 1. feedback.INSERT (WITH CHECK true):
--    Allows anonymous/authenticated users to submit feedback without restrictions.
--    This is intentional for public feedback forms.
--
-- 2. waitlist.INSERT (WITH CHECK true):
--    Allows anyone to join the waitlist without restrictions.
--    This is intentional for public waitlist signups.
--
-- Both tables should have rate limiting at the application layer (API routes)
-- to prevent abuse, which is already implemented.
-- =============================================================================
