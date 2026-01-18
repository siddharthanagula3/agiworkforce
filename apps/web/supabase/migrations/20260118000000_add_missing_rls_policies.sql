-- Migration: Add missing RLS policies for security compliance
-- Date: 2026-01-18
--
-- This migration adds Row Level Security policies to all tables that were
-- identified as missing proper access controls during the security audit.
--
-- CRITICAL: api_keys table contains sensitive API key hashes
-- HIGH: Multiple tables missing user-scoped access controls

-- =============================================================================
-- 1. CRITICAL: api_keys - Enable RLS and add user policies
-- Contains API key hashes - users must only access their own keys
-- =============================================================================
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

-- Users can view their own API keys
CREATE POLICY "Users can view own api keys"
  ON public.api_keys
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- Users can create their own API keys
CREATE POLICY "Users can create own api keys"
  ON public.api_keys
  FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- Users can update their own API keys (e.g., rename, deactivate)
CREATE POLICY "Users can update own api keys"
  ON public.api_keys
  FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- Users can delete their own API keys
CREATE POLICY "Users can delete own api keys"
  ON public.api_keys
  FOR DELETE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- Service role has full access for admin operations
CREATE POLICY "Service role manages api keys"
  ON public.api_keys
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- =============================================================================
-- 2. organizations - Enable RLS with membership-based access
-- =============================================================================
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- Users can view organizations they are members of
CREATE POLICY "Members can view organization"
  ON public.organizations
  FOR SELECT
  TO authenticated
  USING (
    id IN (
      SELECT organization_id
      FROM public.organization_members
      WHERE user_id = (SELECT auth.uid())
    )
    OR created_by = (SELECT auth.uid())
  );

-- Users can create organizations (becomes owner)
CREATE POLICY "Users can create organizations"
  ON public.organizations
  FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = created_by);

-- Only owners/admins can update organizations
CREATE POLICY "Admins can update organization"
  ON public.organizations
  FOR UPDATE
  TO authenticated
  USING (
    id IN (
      SELECT organization_id
      FROM public.organization_members
      WHERE user_id = (SELECT auth.uid())
        AND role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    id IN (
      SELECT organization_id
      FROM public.organization_members
      WHERE user_id = (SELECT auth.uid())
        AND role IN ('owner', 'admin')
    )
  );

-- Only owners can delete organizations
CREATE POLICY "Owners can delete organization"
  ON public.organizations
  FOR DELETE
  TO authenticated
  USING (
    id IN (
      SELECT organization_id
      FROM public.organization_members
      WHERE user_id = (SELECT auth.uid())
        AND role = 'owner'
    )
  );

-- Service role has full access
CREATE POLICY "Service role manages organizations"
  ON public.organizations
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- =============================================================================
-- 3. organization_members - Enable RLS with org-based access
-- =============================================================================
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

-- Members can view other members in their organizations
CREATE POLICY "Members can view org members"
  ON public.organization_members
  FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id
      FROM public.organization_members
      WHERE user_id = (SELECT auth.uid())
    )
  );

-- Admins/owners can add members
CREATE POLICY "Admins can add members"
  ON public.organization_members
  FOR INSERT
  TO authenticated
  WITH CHECK (
    organization_id IN (
      SELECT organization_id
      FROM public.organization_members
      WHERE user_id = (SELECT auth.uid())
        AND role IN ('owner', 'admin')
    )
  );

-- Admins/owners can update member roles (but not owner role)
CREATE POLICY "Admins can update members"
  ON public.organization_members
  FOR UPDATE
  TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id
      FROM public.organization_members
      WHERE user_id = (SELECT auth.uid())
        AND role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id
      FROM public.organization_members
      WHERE user_id = (SELECT auth.uid())
        AND role IN ('owner', 'admin')
    )
    -- Prevent non-owners from setting owner role
    AND (role != 'owner' OR (SELECT auth.uid()) IN (
      SELECT om.user_id FROM public.organization_members om
      WHERE om.organization_id = organization_id AND om.role = 'owner'
    ))
  );

-- Admins/owners can remove members, members can remove themselves
CREATE POLICY "Admins can remove members or self"
  ON public.organization_members
  FOR DELETE
  TO authenticated
  USING (
    -- Self-removal
    user_id = (SELECT auth.uid())
    OR
    -- Admin/owner removal
    organization_id IN (
      SELECT organization_id
      FROM public.organization_members
      WHERE user_id = (SELECT auth.uid())
        AND role IN ('owner', 'admin')
    )
  );

-- Service role has full access
CREATE POLICY "Service role manages org members"
  ON public.organization_members
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- =============================================================================
-- 4. notifications - Enable RLS with user-scoped access
-- =============================================================================
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Users can view their own notifications
CREATE POLICY "Users can view own notifications"
  ON public.notifications
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- Users can update their own notifications (mark as read)
CREATE POLICY "Users can update own notifications"
  ON public.notifications
  FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- Users can delete their own notifications
CREATE POLICY "Users can delete own notifications"
  ON public.notifications
  FOR DELETE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- Service role can create notifications for users
CREATE POLICY "Service role manages notifications"
  ON public.notifications
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- =============================================================================
-- 5. feature_flags - Add user SELECT policy (service_role already exists)
-- =============================================================================
-- RLS already enabled by previous migration
-- Only add user policy if not exists

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'feature_flags'
      AND policyname = 'Users can view own feature flags'
  ) THEN
    CREATE POLICY "Users can view own feature flags"
      ON public.feature_flags
      FOR SELECT
      TO authenticated
      USING ((SELECT auth.uid()) = user_id);
  END IF;
END $$;

-- =============================================================================
-- 6. feedback - Add user SELECT policy (permissive INSERT already exists)
-- =============================================================================
ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

-- Users can view their own feedback
CREATE POLICY "Users can view own feedback"
  ON public.feedback
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- Permissive INSERT for anonymous feedback already exists
-- Service role for admin review
CREATE POLICY "Service role manages feedback"
  ON public.feedback
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- =============================================================================
-- 7. usage_events - Add user SELECT policy (service_role already exists)
-- =============================================================================
-- RLS already enabled by previous migration

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'usage_events'
      AND policyname = 'Users can view own usage events'
  ) THEN
    CREATE POLICY "Users can view own usage events"
      ON public.usage_events
      FOR SELECT
      TO authenticated
      USING ((SELECT auth.uid()) = user_id);
  END IF;
END $$;

-- =============================================================================
-- 8. audit_logs - Enable RLS with user/org-scoped access
-- =============================================================================
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Users can view their own audit logs
CREATE POLICY "Users can view own audit logs"
  ON public.audit_logs
  FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR
    -- Can also view org audit logs if admin/owner
    organization_id IN (
      SELECT organization_id
      FROM public.organization_members
      WHERE user_id = (SELECT auth.uid())
        AND role IN ('owner', 'admin')
    )
  );

-- Service role manages all audit logs
CREATE POLICY "Service role manages audit logs"
  ON public.audit_logs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- =============================================================================
-- 9. pricing_plans - Enable RLS with public read access
-- =============================================================================
ALTER TABLE public.pricing_plans ENABLE ROW LEVEL SECURITY;

-- Anyone can view active pricing plans (public information)
CREATE POLICY "Anyone can view active pricing plans"
  ON public.pricing_plans
  FOR SELECT
  TO authenticated, anon
  USING (is_active = true);

-- Service role manages pricing (already exists from previous migration)
-- Check if already exists
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
-- 10. waitlist - Enable RLS with self-management
-- =============================================================================
ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;

-- Users can view their own waitlist entry by email
-- Note: This requires the user to be authenticated and match email
CREATE POLICY "Users can view own waitlist entry"
  ON public.waitlist
  FOR SELECT
  TO authenticated
  USING (
    email = (SELECT email FROM auth.users WHERE id = (SELECT auth.uid()))
  );

-- Anonymous users can join waitlist (permissive INSERT)
CREATE POLICY "Anyone can join waitlist"
  ON public.waitlist
  FOR INSERT
  TO authenticated, anon
  WITH CHECK (true);

-- Users can update their own waitlist entry (e.g., unsubscribe)
CREATE POLICY "Users can update own waitlist entry"
  ON public.waitlist
  FOR UPDATE
  TO authenticated
  USING (
    email = (SELECT email FROM auth.users WHERE id = (SELECT auth.uid()))
  )
  WITH CHECK (
    email = (SELECT email FROM auth.users WHERE id = (SELECT auth.uid()))
  );

-- Service role has full access
CREATE POLICY "Service role manages waitlist"
  ON public.waitlist
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- =============================================================================
-- 11. beta_invites - Enable RLS with creator access
-- =============================================================================
ALTER TABLE public.beta_invites ENABLE ROW LEVEL SECURITY;

-- Users can view invites they created
CREATE POLICY "Creators can view own beta invites"
  ON public.beta_invites
  FOR SELECT
  TO authenticated
  USING (created_by = (SELECT auth.uid()));

-- Service role manages all invites
CREATE POLICY "Service role manages beta invites"
  ON public.beta_invites
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- =============================================================================
-- 12. beta_redemptions - Add user SELECT policy (service_role already exists)
-- =============================================================================
-- RLS already enabled by previous migration

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'beta_redemptions'
      AND policyname = 'Users can view own beta redemptions'
  ) THEN
    CREATE POLICY "Users can view own beta redemptions"
      ON public.beta_redemptions
      FOR SELECT
      TO authenticated
      USING ((SELECT auth.uid()) = user_id);
  END IF;
END $$;

-- =============================================================================
-- 13. email_campaigns - Service role only (admin feature)
-- =============================================================================
ALTER TABLE public.email_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages email campaigns"
  ON public.email_campaigns
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- =============================================================================
-- 14. email_sends - Service role only (admin feature)
-- =============================================================================
ALTER TABLE public.email_sends ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages email sends"
  ON public.email_sends
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- =============================================================================
-- 15. email_preferences - Add user policies (service_role already exists)
-- =============================================================================
-- RLS already enabled by previous migration

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'email_preferences'
      AND policyname = 'Users can view own email preferences'
  ) THEN
    CREATE POLICY "Users can view own email preferences"
      ON public.email_preferences
      FOR SELECT
      TO authenticated
      USING ((SELECT auth.uid()) = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'email_preferences'
      AND policyname = 'Users can update own email preferences'
  ) THEN
    CREATE POLICY "Users can update own email preferences"
      ON public.email_preferences
      FOR UPDATE
      TO authenticated
      USING ((SELECT auth.uid()) = user_id)
      WITH CHECK ((SELECT auth.uid()) = user_id);
  END IF;
END $$;

-- =============================================================================
-- 16. referrals - Add user policies (service_role already exists)
-- =============================================================================
-- RLS already enabled by previous migration

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'referrals'
      AND policyname = 'Users can view own referrals'
  ) THEN
    CREATE POLICY "Users can view own referrals"
      ON public.referrals
      FOR SELECT
      TO authenticated
      USING (
        referrer_id = (SELECT auth.uid())
        OR referred_user_id = (SELECT auth.uid())
      );
  END IF;
END $$;

-- Users can create referrals as referrer
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'referrals'
      AND policyname = 'Users can create referrals'
  ) THEN
    CREATE POLICY "Users can create referrals"
      ON public.referrals
      FOR INSERT
      TO authenticated
      WITH CHECK ((SELECT auth.uid()) = referrer_id);
  END IF;
END $$;

-- =============================================================================
-- Analyze all affected tables for query optimization
-- =============================================================================
ANALYZE public.api_keys;
ANALYZE public.organizations;
ANALYZE public.organization_members;
ANALYZE public.notifications;
ANALYZE public.feature_flags;
ANALYZE public.feedback;
ANALYZE public.usage_events;
ANALYZE public.audit_logs;
ANALYZE public.pricing_plans;
ANALYZE public.waitlist;
ANALYZE public.beta_invites;
ANALYZE public.beta_redemptions;
ANALYZE public.email_campaigns;
ANALYZE public.email_sends;
ANALYZE public.email_preferences;
ANALYZE public.referrals;

-- =============================================================================
-- Add indexes to support RLS policies efficiently
-- =============================================================================

-- Index for organization_members lookups (used in many RLS policies)
CREATE INDEX IF NOT EXISTS idx_org_members_user_id_role
  ON public.organization_members(user_id, role);

-- Index for notifications user lookup
CREATE INDEX IF NOT EXISTS idx_notifications_user_id
  ON public.notifications(user_id);

-- Index for audit_logs user and org lookup
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id
  ON public.audit_logs(user_id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_organization_id
  ON public.audit_logs(organization_id);

-- Index for email_preferences user lookup
CREATE INDEX IF NOT EXISTS idx_email_preferences_user_id
  ON public.email_preferences(user_id);

-- Index for referrals user lookups
CREATE INDEX IF NOT EXISTS idx_referrals_referrer_id
  ON public.referrals(referrer_id);

CREATE INDEX IF NOT EXISTS idx_referrals_referred_user_id
  ON public.referrals(referred_user_id);

-- =============================================================================
-- Comments for documentation
-- =============================================================================

COMMENT ON TABLE public.api_keys IS 'API keys for programmatic access. CRITICAL: Contains key hashes, RLS enforced.';
COMMENT ON TABLE public.organizations IS 'User organizations with membership-based RLS access control.';
COMMENT ON TABLE public.organization_members IS 'Organization membership with role-based permissions.';
COMMENT ON TABLE public.notifications IS 'User notifications with user-scoped RLS.';
COMMENT ON TABLE public.audit_logs IS 'Audit trail with user and organization-scoped access.';
