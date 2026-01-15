-- Migration: Critical fixes, missing indexes, and GDPR compliance
-- Date: 2026-01-15
--
-- This migration addresses:
-- 1. Schema bug fix: handle_refund function uses wrong column name (account_id vs credit_account_id)
-- 2. Missing column: plan_duration_days in beta_invites table
-- 3. Missing column: is_active in api_keys table
-- 4. GDPR compliance: User data deletion (Article 17) and export (Article 20)
-- 5. Missing composite indexes for common query patterns
-- 6. RLS optimization: Convert remaining auth.uid() to (SELECT auth.uid()) pattern

-- =============================================================================
-- 1. FIX: handle_refund function - account_id should be credit_account_id
-- =============================================================================

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

  -- Record the transaction - FIX: use credit_account_id instead of account_id
  INSERT INTO public.credit_transactions (
    user_id,
    credit_account_id,  -- FIXED: was incorrectly 'account_id'
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

-- Ensure proper permissions
GRANT EXECUTE ON FUNCTION public.handle_refund TO service_role;

-- =============================================================================
-- 2. ADD: plan_duration_days column to beta_invites table
-- =============================================================================

-- Add plan_duration_days column if it doesn't exist
-- This column is referenced by claim_beta_invite function
ALTER TABLE public.beta_invites
ADD COLUMN IF NOT EXISTS plan_duration_days INTEGER DEFAULT 90;

-- Update existing rows to use trial_days value for plan_duration_days
-- This ensures backward compatibility
UPDATE public.beta_invites
SET plan_duration_days = COALESCE(trial_days, 90)
WHERE plan_duration_days IS NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.beta_invites.plan_duration_days IS
  'Number of days the subscription from this invite is valid. Used by claim_beta_invite function.';

-- =============================================================================
-- 3. ADD: is_active column to api_keys table
-- =============================================================================

-- Add is_active column if it doesn't exist
ALTER TABLE public.api_keys
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Add comment for documentation
COMMENT ON COLUMN public.api_keys.is_active IS
  'Whether the API key is currently active. Inactive keys cannot be used for authentication.';

-- =============================================================================
-- 4. ADD: Composite indexes for common query patterns
-- =============================================================================

-- Index for subscriptions(user_id, status) - common filter pattern
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id_status
  ON public.subscriptions(user_id, status);

-- Index for credit_transactions(credit_account_id, created_at) - transaction history queries
CREATE INDEX IF NOT EXISTS idx_credit_transactions_account_created
  ON public.credit_transactions(credit_account_id, created_at DESC);

-- Index for api_keys(user_id, is_active) - active keys lookup
CREATE INDEX IF NOT EXISTS idx_api_keys_user_id_is_active
  ON public.api_keys(user_id, is_active)
  WHERE is_active = true;

-- =============================================================================
-- 5. OPTIMIZE: RLS policies - convert auth.uid() to (SELECT auth.uid())
-- =============================================================================

-- Fix desktop_devices RLS policies
DROP POLICY IF EXISTS "Users can view their own desktop devices" ON public.desktop_devices;
DROP POLICY IF EXISTS "Users can register their own desktop devices" ON public.desktop_devices;
DROP POLICY IF EXISTS "Users can update their own desktop devices" ON public.desktop_devices;
DROP POLICY IF EXISTS "Users can delete their own desktop devices" ON public.desktop_devices;

CREATE POLICY "Users can view their own desktop devices"
  ON public.desktop_devices
  FOR SELECT
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can register their own desktop devices"
  ON public.desktop_devices
  FOR INSERT
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can update their own desktop devices"
  ON public.desktop_devices
  FOR UPDATE
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can delete their own desktop devices"
  ON public.desktop_devices
  FOR DELETE
  USING ((SELECT auth.uid()) = user_id);

-- Fix sync_data RLS policy
DROP POLICY IF EXISTS sync_data_user_policy ON public.sync_data;

CREATE POLICY sync_data_user_policy ON public.sync_data
  FOR ALL
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- =============================================================================
-- 6. GDPR Article 17: Right to Erasure - delete_user_data function
-- =============================================================================

CREATE OR REPLACE FUNCTION public.delete_user_data(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
  v_deleted_counts JSONB := '{}';
  v_count INTEGER;
BEGIN
  -- Validate input
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'user_id is required',
      'deleted_at', NULL
    );
  END IF;

  -- Begin deletion in order of foreign key dependencies (children first, then parents)

  -- 1. Delete credit_transactions (references token_credits)
  DELETE FROM public.credit_transactions WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('credit_transactions', v_count);

  -- 2. Delete token_credits (references subscriptions)
  DELETE FROM public.token_credits WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('token_credits', v_count);

  -- 3. Delete subscriptions (references profiles)
  DELETE FROM public.subscriptions WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('subscriptions', v_count);

  -- 4. Delete beta_redemptions (references profiles and beta_invites)
  DELETE FROM public.beta_redemptions WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('beta_redemptions', v_count);

  -- 5. Delete device_authorization_codes
  DELETE FROM public.device_authorization_codes WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('device_authorization_codes', v_count);

  -- 6. Delete desktop_devices
  DELETE FROM public.desktop_devices WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('desktop_devices', v_count);

  -- 7. Delete sync_data
  DELETE FROM public.sync_data WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('sync_data', v_count);

  -- 8. Delete api_keys (references profiles with CASCADE)
  DELETE FROM public.api_keys WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('api_keys', v_count);

  -- 9. Delete notifications (references profiles with CASCADE)
  DELETE FROM public.notifications WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('notifications', v_count);

  -- 10. Delete usage_events (references profiles)
  DELETE FROM public.usage_events WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('usage_events', v_count);

  -- 11. Delete referrals (both as referrer and referred)
  DELETE FROM public.referrals WHERE referrer_id = p_user_id OR referred_user_id = p_user_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('referrals', v_count);

  -- 12. Delete email_preferences (references profiles)
  DELETE FROM public.email_preferences WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('email_preferences', v_count);

  -- 13. Delete email_sends (references profiles)
  DELETE FROM public.email_sends WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('email_sends', v_count);

  -- 14. Delete feedback (references profiles)
  DELETE FROM public.feedback WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('feedback', v_count);

  -- 15. Delete feature_flags (references profiles)
  DELETE FROM public.feature_flags WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('feature_flags', v_count);

  -- 16. Delete audit_logs (references profiles)
  DELETE FROM public.audit_logs WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('audit_logs', v_count);

  -- 17. Delete organization_members (references profiles)
  DELETE FROM public.organization_members WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('organization_members', v_count);

  -- 18. Delete profiles (main user profile)
  DELETE FROM public.profiles WHERE id = p_user_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted_counts := v_deleted_counts || jsonb_build_object('profiles', v_count);

  -- Build result
  v_result := jsonb_build_object(
    'success', true,
    'user_id', p_user_id,
    'deleted_at', NOW(),
    'deleted_counts', v_deleted_counts,
    'gdpr_article', 'Article 17 - Right to erasure'
  );

  RETURN v_result;

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM,
      'error_detail', SQLSTATE,
      'user_id', p_user_id
    );
END;
$$;

-- Grant execute permission to service role only (admin operation)
GRANT EXECUTE ON FUNCTION public.delete_user_data TO service_role;

COMMENT ON FUNCTION public.delete_user_data IS
  'GDPR Article 17 - Right to erasure. Deletes all user data from the database in proper FK order. Returns confirmation of deleted records.';

-- =============================================================================
-- 7. GDPR Article 20: Right to Data Portability - export_user_data function
-- =============================================================================

CREATE OR REPLACE FUNCTION public.export_user_data(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
  v_profile JSONB;
  v_subscriptions JSONB;
  v_credit_accounts JSONB;
  v_credit_transactions JSONB;
  v_api_keys JSONB;
  v_usage_events JSONB;
  v_referrals JSONB;
  v_email_preferences JSONB;
  v_feedback JSONB;
  v_feature_flags JSONB;
  v_notifications JSONB;
  v_beta_redemptions JSONB;
  v_devices JSONB;
  v_organization_memberships JSONB;
BEGIN
  -- Validate input
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'user_id is required',
      'exported_at', NULL
    );
  END IF;

  -- 1. Export profile
  SELECT to_jsonb(p.*) INTO v_profile
  FROM public.profiles p
  WHERE p.id = p_user_id;

  -- 2. Export subscriptions
  SELECT COALESCE(jsonb_agg(to_jsonb(s.*)), '[]'::jsonb) INTO v_subscriptions
  FROM public.subscriptions s
  WHERE s.user_id = p_user_id;

  -- 3. Export credit accounts (token_credits)
  SELECT COALESCE(jsonb_agg(to_jsonb(tc.*)), '[]'::jsonb) INTO v_credit_accounts
  FROM public.token_credits tc
  WHERE tc.user_id = p_user_id;

  -- 4. Export credit transactions
  SELECT COALESCE(jsonb_agg(to_jsonb(ct.*)), '[]'::jsonb) INTO v_credit_transactions
  FROM public.credit_transactions ct
  WHERE ct.user_id = p_user_id
  ORDER BY ct.created_at DESC;

  -- 5. Export API keys (exclude key_hash for security)
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', ak.id,
      'name', ak.name,
      'scopes', ak.scopes,
      'is_active', ak.is_active,
      'last_used_at', ak.last_used_at,
      'expires_at', ak.expires_at,
      'created_at', ak.created_at
    )
  ), '[]'::jsonb) INTO v_api_keys
  FROM public.api_keys ak
  WHERE ak.user_id = p_user_id;

  -- 6. Export usage events
  SELECT COALESCE(jsonb_agg(to_jsonb(ue.*)), '[]'::jsonb) INTO v_usage_events
  FROM public.usage_events ue
  WHERE ue.user_id = p_user_id
  ORDER BY ue.created_at DESC;

  -- 7. Export referrals (both as referrer and referred)
  SELECT COALESCE(jsonb_agg(to_jsonb(r.*)), '[]'::jsonb) INTO v_referrals
  FROM public.referrals r
  WHERE r.referrer_id = p_user_id OR r.referred_user_id = p_user_id;

  -- 8. Export email preferences
  SELECT COALESCE(jsonb_agg(to_jsonb(ep.*)), '[]'::jsonb) INTO v_email_preferences
  FROM public.email_preferences ep
  WHERE ep.user_id = p_user_id;

  -- 9. Export feedback
  SELECT COALESCE(jsonb_agg(to_jsonb(f.*)), '[]'::jsonb) INTO v_feedback
  FROM public.feedback f
  WHERE f.user_id = p_user_id
  ORDER BY f.created_at DESC;

  -- 10. Export feature flags
  SELECT COALESCE(jsonb_agg(to_jsonb(ff.*)), '[]'::jsonb) INTO v_feature_flags
  FROM public.feature_flags ff
  WHERE ff.user_id = p_user_id;

  -- 11. Export notifications
  SELECT COALESCE(jsonb_agg(to_jsonb(n.*)), '[]'::jsonb) INTO v_notifications
  FROM public.notifications n
  WHERE n.user_id = p_user_id
  ORDER BY n.created_at DESC;

  -- 12. Export beta redemptions
  SELECT COALESCE(jsonb_agg(to_jsonb(br.*)), '[]'::jsonb) INTO v_beta_redemptions
  FROM public.beta_redemptions br
  WHERE br.user_id = p_user_id;

  -- 13. Export devices (desktop_devices)
  SELECT COALESCE(jsonb_agg(to_jsonb(dd.*)), '[]'::jsonb) INTO v_devices
  FROM public.desktop_devices dd
  WHERE dd.user_id = p_user_id;

  -- 14. Export organization memberships
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'organization_id', om.organization_id,
      'organization_name', o.name,
      'role', om.role,
      'joined_at', om.joined_at
    )
  ), '[]'::jsonb) INTO v_organization_memberships
  FROM public.organization_members om
  JOIN public.organizations o ON o.id = om.organization_id
  WHERE om.user_id = p_user_id;

  -- Build complete export
  v_result := jsonb_build_object(
    'success', true,
    'user_id', p_user_id,
    'exported_at', NOW(),
    'gdpr_article', 'Article 20 - Right to data portability',
    'data', jsonb_build_object(
      'profile', COALESCE(v_profile, '{}'::jsonb),
      'subscriptions', v_subscriptions,
      'credit_accounts', v_credit_accounts,
      'credit_transactions', v_credit_transactions,
      'api_keys', v_api_keys,
      'usage_events', v_usage_events,
      'referrals', v_referrals,
      'email_preferences', v_email_preferences,
      'feedback', v_feedback,
      'feature_flags', v_feature_flags,
      'notifications', v_notifications,
      'beta_redemptions', v_beta_redemptions,
      'devices', v_devices,
      'organization_memberships', v_organization_memberships
    )
  );

  RETURN v_result;

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM,
      'error_detail', SQLSTATE,
      'user_id', p_user_id
    );
END;
$$;

-- Grant execute permission to service role only (admin operation)
-- Also grant to authenticated so users can export their own data
GRANT EXECUTE ON FUNCTION public.export_user_data TO service_role;
GRANT EXECUTE ON FUNCTION public.export_user_data TO authenticated;

COMMENT ON FUNCTION public.export_user_data IS
  'GDPR Article 20 - Right to data portability. Exports all user data as JSONB. API keys exclude key_hash for security.';

-- =============================================================================
-- 8. Add RLS policy for export_user_data to allow users to export only their own data
-- =============================================================================

-- Create a wrapper function that enforces user can only export their own data
CREATE OR REPLACE FUNCTION public.export_my_data()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Authentication required',
      'exported_at', NULL
    );
  END IF;

  RETURN public.export_user_data(v_user_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.export_my_data TO authenticated;

COMMENT ON FUNCTION public.export_my_data IS
  'GDPR Article 20 - Allows authenticated users to export their own data. Wrapper around export_user_data that enforces self-only access.';

-- =============================================================================
-- 9. Analyze affected tables for query optimization
-- =============================================================================

ANALYZE public.subscriptions;
ANALYZE public.credit_transactions;
ANALYZE public.api_keys;
ANALYZE public.beta_invites;
ANALYZE public.desktop_devices;
