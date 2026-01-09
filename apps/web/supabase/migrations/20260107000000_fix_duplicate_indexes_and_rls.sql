-- Migration: Fix duplicate indexes and optimize RLS policies
-- Addresses Supabase advisor warnings for performance improvements

-- 1. Drop duplicate indexes on subscriptions table
-- idx_subscriptions_user_id is redundant with idx_subscriptions_user_id_unique and subscriptions_user_id_unique
DROP INDEX IF EXISTS idx_subscriptions_user_id;

-- idx_subscriptions_stripe_customer_id is redundant with subscriptions_stripe_customer_id_key (unique constraint)
DROP INDEX IF EXISTS idx_subscriptions_stripe_customer_id;

-- idx_subscriptions_stripe_subscription_id is redundant with subscriptions_stripe_subscription_id_key (unique constraint)
DROP INDEX IF EXISTS idx_subscriptions_stripe_subscription_id;

-- 2. Drop duplicate index on credit_transactions table
-- idx_credit_transactions_user_id is redundant with idx_credit_txn_user_id
DROP INDEX IF EXISTS idx_credit_transactions_user_id;

-- 3. Drop duplicate unique index on subscriptions.user_id
-- idx_subscriptions_user_id_unique is redundant with subscriptions_user_id_unique (constraint)
DROP INDEX IF EXISTS idx_subscriptions_user_id_unique;

-- 4. Fix RLS policy on device_authorization_codes to use subquery pattern
-- The current policy uses auth.uid() directly which triggers re-evaluation per row
-- Using (SELECT auth.uid()) is more efficient as it evaluates once
DROP POLICY IF EXISTS "Users can view their own device authorizations" ON public.device_authorization_codes;

CREATE POLICY "Users can view their own device authorizations"
  ON public.device_authorization_codes
  FOR SELECT
  USING ((SELECT auth.uid()) = user_id);

-- 5. Analyze tables to update statistics after index changes
ANALYZE public.subscriptions;
ANALYZE public.credit_transactions;
ANALYZE public.device_authorization_codes;
