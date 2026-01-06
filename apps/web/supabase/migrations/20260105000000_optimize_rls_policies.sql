-- 20260105000000_optimize_rls_policies.sql
-- Optimize RLS policies according to Supabase best practices
-- Wrap auth.uid() in SELECT statement to allow Postgres optimizer to cache the result per-statement
-- This can improve performance by up to 94% according to Supabase benchmarks
-- Reference: https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select

-- =============================================================================
-- 1. PROFILES TABLE POLICIES - Optimize auth.uid() calls
-- =============================================================================
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT TO authenticated
  USING ((select auth.uid()) = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE TO authenticated
  USING ((select auth.uid()) = id);

-- =============================================================================
-- 2. SUBSCRIPTIONS TABLE POLICIES - Optimize auth.uid() calls
-- =============================================================================
DROP POLICY IF EXISTS "Users can view own subscription" ON public.subscriptions;

CREATE POLICY "Users can view own subscription"
  ON public.subscriptions FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

-- =============================================================================
-- 3. TOKEN_CREDITS TABLE POLICIES - Optimize auth.uid() calls
-- =============================================================================
DROP POLICY IF EXISTS "Users can view own credits" ON public.token_credits;

CREATE POLICY "Users can view own credits"
  ON public.token_credits FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

-- =============================================================================
-- 4. CREDIT_TRANSACTIONS TABLE POLICIES - Optimize auth.uid() calls
-- =============================================================================
DROP POLICY IF EXISTS "Users can view own transactions" ON public.credit_transactions;

CREATE POLICY "Users can view own transactions"
  ON public.credit_transactions FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

-- Add indexes to columns used in the optimized RLS policies (best practice)
-- These help the query optimizer construct better query plans
CREATE INDEX IF NOT EXISTS idx_profiles_id ON public.profiles(id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON public.subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_token_credits_user_id ON public.token_credits(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_id ON public.credit_transactions(user_id);
