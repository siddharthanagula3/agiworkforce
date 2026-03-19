-- Migration: Fill remaining RLS gaps
-- Date: 2026-03-19
--
-- 20260118000000_add_missing_rls_policies.sql already added SELECT (and some
-- INSERT/UPDATE) policies to beta_redemptions, email_preferences, feature_flags,
-- referrals, and usage_events. However those tables still lack:
--
--   beta_redemptions   — no INSERT policy (service_role already manages writes)
--   email_preferences  — no INSERT policy for self-registration
--   feature_flags      — no INSERT/UPDATE/DELETE; service_role handles all writes
--   referrals          — no UPDATE/DELETE policies
--   usage_events       — no INSERT policy; service_role handles writes
--
-- All policies below are wrapped in DO blocks to be idempotent so the migration
-- is safe to re-run or apply on a branch that already ran a subset of these.

-- =============================================================================
-- 1. beta_redemptions
--    RLS already enabled. SELECT policy already exists.
--    Add service_role full-access so background jobs can write redemptions.
-- =============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'beta_redemptions'
      AND policyname = 'Service role manages redemptions'
  ) THEN
    CREATE POLICY "Service role manages redemptions"
      ON public.beta_redemptions
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- =============================================================================
-- 2. email_preferences
--    RLS already enabled. SELECT and UPDATE policies already exist.
--    Add INSERT so a user can create their own preference row on sign-up.
--    Add service_role full-access for welcome-email and preference-sync jobs.
-- =============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'email_preferences'
      AND policyname = 'Users can create own email preferences'
  ) THEN
    CREATE POLICY "Users can create own email preferences"
      ON public.email_preferences
      FOR INSERT
      TO authenticated
      WITH CHECK ((SELECT auth.uid()) = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'email_preferences'
      AND policyname = 'Service role manages email preferences'
  ) THEN
    CREATE POLICY "Service role manages email preferences"
      ON public.email_preferences
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- =============================================================================
-- 3. feature_flags
--    RLS already enabled. SELECT policy already exists.
--    Service_role manages all writes (flags are set by the platform, not users).
-- =============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'feature_flags'
      AND policyname = 'Service role manages feature flags'
  ) THEN
    CREATE POLICY "Service role manages feature flags"
      ON public.feature_flags
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- =============================================================================
-- 4. referrals
--    RLS already enabled. SELECT and INSERT policies already exist.
--    Add service_role full-access for referral attribution jobs.
-- =============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'referrals'
      AND policyname = 'Service role manages referrals'
  ) THEN
    CREATE POLICY "Service role manages referrals"
      ON public.referrals
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- =============================================================================
-- 5. usage_events
--    RLS already enabled. SELECT policy already exists.
--    Service_role manages all writes (events are emitted by the platform).
-- =============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'usage_events'
      AND policyname = 'Service role manages usage events'
  ) THEN
    CREATE POLICY "Service role manages usage events"
      ON public.usage_events
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;
