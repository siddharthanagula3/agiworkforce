-- 20260521100000_enterprise_control_plane_foundation.sql
--
-- Canonical enterprise control-plane foundation.
--
-- This migration intentionally backfills tables that previously existed only in
-- apps/web/supabase/migrations so fresh environments can run from the root
-- supabase/migrations path. It also adds the policy, managed-credit, support,
-- feedback, and usage-ledger tables needed before AGI can safely offer
-- Anthropic/OpenAI-style enterprise application features.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- 1. Legacy Web enterprise tables moved into the canonical migration path
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.organization_members (
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  provisioning_source text NOT NULL DEFAULT 'manual'
    CHECK (provisioning_source IN ('manual', 'scim', 'sso_jit', 'admin')),
  provisioned_at timestamptz,
  joined_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  PRIMARY KEY (organization_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  action text NOT NULL,
  resource text NOT NULL,
  resource_id text,
  metadata jsonb NOT NULL DEFAULT '{}',
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS external_id text,
  ADD COLUMN IF NOT EXISTS provisioning_source text
    CHECK (provisioning_source IN ('self', 'scim', 'sso_jit', 'admin')) DEFAULT 'self',
  ADD COLUMN IF NOT EXISTS provisioned_at timestamptz,
  ADD COLUMN IF NOT EXISTS department text,
  ADD COLUMN IF NOT EXISTS job_title text;

CREATE TABLE IF NOT EXISTS public.sso_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider_type text NOT NULL CHECK (provider_type IN ('saml', 'oidc')),
  domain text NOT NULL,
  display_name text,
  metadata_url text,
  metadata_xml text,
  attribute_mapping jsonb NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id),
  UNIQUE (domain)
);

CREATE TABLE IF NOT EXISTS public.directory_sync_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('okta', 'azure_ad', 'google', 'onelogin', 'generic_scim')),
  directory_id text NOT NULL,
  display_name text,
  is_active boolean NOT NULL DEFAULT true,
  last_sync_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (directory_id)
);

CREATE TABLE IF NOT EXISTS public.directory_sync_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text UNIQUE NOT NULL,
  event_type text NOT NULL,
  directory_id text NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb
);

CREATE TABLE IF NOT EXISTS public.security_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('info', 'warning', 'error', 'critical')),
  ip_address text,
  user_agent text,
  endpoint text,
  details jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- 2. Enterprise policy and commercial-control tables
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.organization_admin_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
  default_privacy_mode text NOT NULL DEFAULT 'byok'
    CHECK (default_privacy_mode IN ('local', 'byok', 'managed')),
  allowed_privacy_modes text[] NOT NULL DEFAULT ARRAY['local', 'byok']::text[],
  allow_managed_compute boolean NOT NULL DEFAULT false,
  require_local_to_byok_preview boolean NOT NULL DEFAULT true,
  chat_sync_surfaces text[] NOT NULL DEFAULT ARRAY['web', 'desktop', 'mobile']::text[],
  allow_cli_cloud_sync boolean NOT NULL DEFAULT false,
  allow_vscode_cloud_sync boolean NOT NULL DEFAULT false,
  allow_chrome_cloud_sync boolean NOT NULL DEFAULT false,
  audit_export_enabled boolean NOT NULL DEFAULT true,
  retention_days integer NOT NULL DEFAULT 365 CHECK (retention_days BETWEEN 1 AND 3650),
  metadata jsonb NOT NULL DEFAULT '{}',
  created_by uuid REFERENCES public.profiles(id),
  updated_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.organization_provider_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
  allowed_providers text[] NOT NULL DEFAULT ARRAY[]::text[],
  blocked_providers text[] NOT NULL DEFAULT ARRAY[]::text[],
  allowed_models text[] NOT NULL DEFAULT ARRAY[]::text[],
  blocked_models text[] NOT NULL DEFAULT ARRAY[]::text[],
  require_store_false_for_byok boolean NOT NULL DEFAULT true,
  allow_provider_training_opt_in boolean NOT NULL DEFAULT false,
  managed_provider_allowlist text[] NOT NULL DEFAULT ARRAY[]::text[],
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.organization_connector_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  connector_id text NOT NULL,
  mode text NOT NULL DEFAULT 'admin_approved'
    CHECK (mode IN ('disabled', 'admin_approved', 'member_opt_in')),
  allowed_surfaces text[] NOT NULL DEFAULT ARRAY['web', 'desktop']::text[],
  require_admin_approval boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, connector_id)
);

CREATE TABLE IF NOT EXISTS public.organization_retention_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
  conversation_retention_days integer NOT NULL DEFAULT 365 CHECK (conversation_retention_days BETWEEN 1 AND 3650),
  artifact_retention_days integer NOT NULL DEFAULT 365 CHECK (artifact_retention_days BETWEEN 1 AND 3650),
  audit_retention_days integer NOT NULL DEFAULT 730 CHECK (audit_retention_days BETWEEN 90 AND 3650),
  local_export_enabled boolean NOT NULL DEFAULT true,
  deletion_review_required boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.enterprise_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  surface text NOT NULL DEFAULT 'system',
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id text,
  outcome text NOT NULL DEFAULT 'success' CHECK (outcome IN ('success', 'failure', 'denied')),
  severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical')),
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.audit_export_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  requested_by_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  format text NOT NULL DEFAULT 'jsonl' CHECK (format IN ('jsonl', 'csv')),
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'processing', 'ready', 'failed', 'expired')),
  download_url text,
  expires_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.organization_usage_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  privacy_mode text NOT NULL CHECK (privacy_mode IN ('local', 'byok', 'managed')),
  provider text NOT NULL,
  model text NOT NULL,
  input_tokens bigint NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens bigint NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  provider_cost_usd numeric(14, 6) NOT NULL DEFAULT 0 CHECK (provider_cost_usd >= 0),
  charged_amount_usd numeric(14, 6) NOT NULL DEFAULT 0 CHECK (charged_amount_usd >= 0),
  gross_margin_usd numeric(14, 6)
    GENERATED ALWAYS AS (charged_amount_usd - provider_cost_usd) STORED,
  gross_margin_pct numeric(8, 4)
    GENERATED ALWAYS AS (
      CASE
        WHEN charged_amount_usd = 0 THEN NULL
        ELSE (charged_amount_usd - provider_cost_usd) / charged_amount_usd
      END
    ) STORED,
  provider_request_id text,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.provider_cost_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  model text NOT NULL,
  input_usd_per_million_tokens numeric(14, 6) NOT NULL,
  output_usd_per_million_tokens numeric(14, 6) NOT NULL,
  source_url text NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, model, captured_at)
);

CREATE TABLE IF NOT EXISTS public.managed_credit_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'waitlisted'
    CHECK (status IN ('waitlisted', 'private_beta', 'active', 'suspended', 'closed')),
  billing_mode text NOT NULL DEFAULT 'invoice_ach'
    CHECK (billing_mode IN ('invoice_ach', 'invoice_wire', 'stripe_card', 'manual')),
  balance_cents integer NOT NULL DEFAULT 0,
  reserved_refund_cents integer NOT NULL DEFAULT 0 CHECK (reserved_refund_cents >= 0),
  hard_limit_cents integer NOT NULL DEFAULT 0 CHECK (hard_limit_cents >= 0),
  monthly_limit_cents integer NOT NULL DEFAULT 0 CHECK (monthly_limit_cents >= 0),
  public_launch_blocked boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.managed_credit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.managed_credit_accounts(id) ON DELETE CASCADE,
  event_type text NOT NULL
    CHECK (event_type IN ('deposit', 'usage_debit', 'refund_reserve', 'refund_release', 'adjustment', 'chargeback_hold', 'chargeback_loss')),
  amount_cents integer NOT NULL,
  provider_cost_cents integer NOT NULL DEFAULT 0 CHECK (provider_cost_cents >= 0),
  fee_reserve_cents integer NOT NULL DEFAULT 0 CHECK (fee_reserve_cents >= 0),
  idempotency_key text UNIQUE,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.support_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  requester_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  subject text NOT NULL CHECK (char_length(subject) BETWEEN 1 AND 160),
  description text NOT NULL,
  severity text NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'urgent')),
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'triaged', 'in_progress', 'waiting_on_customer', 'resolved', 'closed')),
  privacy_label text NOT NULL DEFAULT 'security_sensitive'
    CHECK (privacy_label IN ('local_only', 'byok', 'managed', 'security_sensitive')),
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.feedback_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  reporter_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  source_surface text NOT NULL CHECK (source_surface IN ('web', 'desktop', 'mobile', 'cli', 'vscode', 'chrome')),
  category text NOT NULL CHECK (category IN ('bug', 'feature_request', 'quality', 'security', 'billing', 'support')),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  body text NOT NULL,
  status text NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'triaged', 'linked_to_fix', 'shipped', 'wont_do')),
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.release_fix_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  feedback_case_id uuid NOT NULL REFERENCES public.feedback_cases(id) ON DELETE CASCADE,
  pull_request_url text,
  commit_sha text,
  release_version text,
  status text NOT NULL DEFAULT 'proposed'
    CHECK (status IN ('proposed', 'merged', 'released', 'rolled_back')),
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- 3. Helper functions for non-recursive organization RLS
-- =============================================================================

CREATE OR REPLACE FUNCTION public.is_organization_member(p_organization_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members om
    WHERE om.organization_id = p_organization_id
      AND om.user_id = p_user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.is_organization_admin(p_organization_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members om
    WHERE om.organization_id = p_organization_id
      AND om.user_id = p_user_id
      AND om.role IN ('owner', 'admin')
  );
$$;

REVOKE ALL ON FUNCTION public.is_organization_member(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_organization_admin(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_organization_member(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_organization_admin(uuid, uuid) TO authenticated, service_role;

-- =============================================================================
-- 4. RLS policies
-- =============================================================================

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sso_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.directory_sync_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.directory_sync_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_admin_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_provider_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_connector_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_retention_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enterprise_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_export_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_usage_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_cost_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.managed_credit_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.managed_credit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.release_fix_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Organization members can view organizations" ON public.organizations;
CREATE POLICY "Organization members can view organizations"
  ON public.organizations FOR SELECT TO authenticated
  USING (public.is_organization_member(id, auth.uid()) OR created_by = auth.uid());

DROP POLICY IF EXISTS "Authenticated users can create organizations" ON public.organizations;
CREATE POLICY "Authenticated users can create organizations"
  ON public.organizations FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "Organization admins can update organizations" ON public.organizations;
CREATE POLICY "Organization admins can update organizations"
  ON public.organizations FOR UPDATE TO authenticated
  USING (public.is_organization_admin(id, auth.uid()))
  WITH CHECK (public.is_organization_admin(id, auth.uid()));

DROP POLICY IF EXISTS "Service role manages organizations" ON public.organizations;
CREATE POLICY "Service role manages organizations"
  ON public.organizations FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Organization members can view memberships" ON public.organization_members;
CREATE POLICY "Organization members can view memberships"
  ON public.organization_members FOR SELECT TO authenticated
  USING (public.is_organization_member(organization_id, auth.uid()));

DROP POLICY IF EXISTS "Organization admins can add memberships" ON public.organization_members;
CREATE POLICY "Organization admins can add memberships"
  ON public.organization_members FOR INSERT TO authenticated
  WITH CHECK (
    public.is_organization_admin(organization_id, auth.uid())
    OR (
      user_id = auth.uid()
      AND role = 'owner'
      AND EXISTS (
        SELECT 1
        FROM public.organizations o
        WHERE o.id = organization_id
          AND o.created_by = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "Organization admins can update memberships" ON public.organization_members;
CREATE POLICY "Organization admins can update memberships"
  ON public.organization_members FOR UPDATE TO authenticated
  USING (public.is_organization_admin(organization_id, auth.uid()))
  WITH CHECK (public.is_organization_admin(organization_id, auth.uid()));

DROP POLICY IF EXISTS "Organization admins can delete memberships" ON public.organization_members;
CREATE POLICY "Organization admins can delete memberships"
  ON public.organization_members FOR DELETE TO authenticated
  USING (public.is_organization_admin(organization_id, auth.uid()));

DROP POLICY IF EXISTS "Service role manages organization_members" ON public.organization_members;
CREATE POLICY "Service role manages organization_members"
  ON public.organization_members FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Organization members can view audit logs" ON public.audit_logs;
CREATE POLICY "Organization members can view audit logs"
  ON public.audit_logs FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR (
      organization_id IS NOT NULL
      AND public.is_organization_member(organization_id, auth.uid())
    )
  );

DROP POLICY IF EXISTS "Service role manages audit_logs" ON public.audit_logs;
CREATE POLICY "Service role manages audit_logs"
  ON public.audit_logs FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Service role manages security_audit_logs" ON public.security_audit_logs;
CREATE POLICY "Service role manages security_audit_logs"
  ON public.security_audit_logs FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Org admins can view SSO connections" ON public.sso_connections;
CREATE POLICY "Org admins can view SSO connections"
  ON public.sso_connections FOR SELECT TO authenticated
  USING (public.is_organization_admin(organization_id, auth.uid()));

DROP POLICY IF EXISTS "Org owners can manage SSO connections" ON public.sso_connections;
CREATE POLICY "Org owners can manage SSO connections"
  ON public.sso_connections FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.organization_members om
      WHERE om.organization_id = sso_connections.organization_id
        AND om.user_id = auth.uid()
        AND om.role = 'owner'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.organization_members om
      WHERE om.organization_id = sso_connections.organization_id
        AND om.user_id = auth.uid()
        AND om.role = 'owner'
    )
  );

DROP POLICY IF EXISTS "Service role full access" ON public.sso_connections;
CREATE POLICY "Service role full access"
  ON public.sso_connections FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Org admins view directory connections" ON public.directory_sync_connections;
CREATE POLICY "Org admins view directory connections"
  ON public.directory_sync_connections FOR SELECT TO authenticated
  USING (public.is_organization_admin(organization_id, auth.uid()));

DROP POLICY IF EXISTS "Service role full access" ON public.directory_sync_connections;
CREATE POLICY "Service role full access"
  ON public.directory_sync_connections FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Service role only" ON public.directory_sync_events;
CREATE POLICY "Service role only"
  ON public.directory_sync_events FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Members view organization admin policies" ON public.organization_admin_policies;
CREATE POLICY "Members view organization admin policies"
  ON public.organization_admin_policies FOR SELECT TO authenticated
  USING (public.is_organization_member(organization_id, auth.uid()));

DROP POLICY IF EXISTS "Admins manage organization admin policies" ON public.organization_admin_policies;
CREATE POLICY "Admins manage organization admin policies"
  ON public.organization_admin_policies FOR ALL TO authenticated
  USING (public.is_organization_admin(organization_id, auth.uid()))
  WITH CHECK (public.is_organization_admin(organization_id, auth.uid()));

DROP POLICY IF EXISTS "Service role manages organization admin policies" ON public.organization_admin_policies;
CREATE POLICY "Service role manages organization admin policies"
  ON public.organization_admin_policies FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Members view provider policies" ON public.organization_provider_policies;
CREATE POLICY "Members view provider policies"
  ON public.organization_provider_policies FOR SELECT TO authenticated
  USING (public.is_organization_member(organization_id, auth.uid()));

DROP POLICY IF EXISTS "Admins manage provider policies" ON public.organization_provider_policies;
CREATE POLICY "Admins manage provider policies"
  ON public.organization_provider_policies FOR ALL TO authenticated
  USING (public.is_organization_admin(organization_id, auth.uid()))
  WITH CHECK (public.is_organization_admin(organization_id, auth.uid()));

DROP POLICY IF EXISTS "Members view connector policies" ON public.organization_connector_policies;
CREATE POLICY "Members view connector policies"
  ON public.organization_connector_policies FOR SELECT TO authenticated
  USING (public.is_organization_member(organization_id, auth.uid()));

DROP POLICY IF EXISTS "Admins manage connector policies" ON public.organization_connector_policies;
CREATE POLICY "Admins manage connector policies"
  ON public.organization_connector_policies FOR ALL TO authenticated
  USING (public.is_organization_admin(organization_id, auth.uid()))
  WITH CHECK (public.is_organization_admin(organization_id, auth.uid()));

DROP POLICY IF EXISTS "Members view retention policies" ON public.organization_retention_policies;
CREATE POLICY "Members view retention policies"
  ON public.organization_retention_policies FOR SELECT TO authenticated
  USING (public.is_organization_member(organization_id, auth.uid()));

DROP POLICY IF EXISTS "Admins manage retention policies" ON public.organization_retention_policies;
CREATE POLICY "Admins manage retention policies"
  ON public.organization_retention_policies FOR ALL TO authenticated
  USING (public.is_organization_admin(organization_id, auth.uid()))
  WITH CHECK (public.is_organization_admin(organization_id, auth.uid()));

DROP POLICY IF EXISTS "Admins view enterprise audit events" ON public.enterprise_audit_events;
CREATE POLICY "Admins view enterprise audit events"
  ON public.enterprise_audit_events FOR SELECT TO authenticated
  USING (public.is_organization_admin(organization_id, auth.uid()));

DROP POLICY IF EXISTS "Service role manages enterprise audit events" ON public.enterprise_audit_events;
CREATE POLICY "Service role manages enterprise audit events"
  ON public.enterprise_audit_events FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Admins manage audit export requests" ON public.audit_export_requests;
CREATE POLICY "Admins manage audit export requests"
  ON public.audit_export_requests FOR ALL TO authenticated
  USING (public.is_organization_admin(organization_id, auth.uid()))
  WITH CHECK (
    public.is_organization_admin(organization_id, auth.uid())
    AND requested_by_user_id = auth.uid()
  );

DROP POLICY IF EXISTS "Service role manages audit export requests" ON public.audit_export_requests;
CREATE POLICY "Service role manages audit export requests"
  ON public.audit_export_requests FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Admins view organization usage ledger" ON public.organization_usage_ledger;
CREATE POLICY "Admins view organization usage ledger"
  ON public.organization_usage_ledger FOR SELECT TO authenticated
  USING (
    organization_id IS NOT NULL
    AND public.is_organization_admin(organization_id, auth.uid())
  );

DROP POLICY IF EXISTS "Service role manages organization usage ledger" ON public.organization_usage_ledger;
CREATE POLICY "Service role manages organization usage ledger"
  ON public.organization_usage_ledger FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users view provider cost snapshots" ON public.provider_cost_snapshots;
CREATE POLICY "Authenticated users view provider cost snapshots"
  ON public.provider_cost_snapshots FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Service role manages provider cost snapshots" ON public.provider_cost_snapshots;
CREATE POLICY "Service role manages provider cost snapshots"
  ON public.provider_cost_snapshots FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Admins view managed credit accounts" ON public.managed_credit_accounts;
CREATE POLICY "Admins view managed credit accounts"
  ON public.managed_credit_accounts FOR SELECT TO authenticated
  USING (public.is_organization_admin(organization_id, auth.uid()));

DROP POLICY IF EXISTS "Service role manages managed credit accounts" ON public.managed_credit_accounts;
CREATE POLICY "Service role manages managed credit accounts"
  ON public.managed_credit_accounts FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Admins view managed credit events" ON public.managed_credit_events;
CREATE POLICY "Admins view managed credit events"
  ON public.managed_credit_events FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.managed_credit_accounts a
      WHERE a.id = managed_credit_events.account_id
        AND public.is_organization_admin(a.organization_id, auth.uid())
    )
  );

DROP POLICY IF EXISTS "Service role manages managed credit events" ON public.managed_credit_events;
CREATE POLICY "Service role manages managed credit events"
  ON public.managed_credit_events FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Users can create support cases" ON public.support_cases;
CREATE POLICY "Users can create support cases"
  ON public.support_cases FOR INSERT TO authenticated
  WITH CHECK (
    requester_user_id = auth.uid()
    AND (
      organization_id IS NULL
      OR public.is_organization_member(organization_id, auth.uid())
    )
  );

DROP POLICY IF EXISTS "Support case owners and org admins can view support cases" ON public.support_cases;
CREATE POLICY "Support case owners and org admins can view support cases"
  ON public.support_cases FOR SELECT TO authenticated
  USING (
    requester_user_id = auth.uid()
    OR (
      organization_id IS NOT NULL
      AND public.is_organization_admin(organization_id, auth.uid())
    )
  );

DROP POLICY IF EXISTS "Org admins can update support cases" ON public.support_cases;
CREATE POLICY "Org admins can update support cases"
  ON public.support_cases FOR UPDATE TO authenticated
  USING (
    organization_id IS NOT NULL
    AND public.is_organization_admin(organization_id, auth.uid())
  )
  WITH CHECK (
    organization_id IS NOT NULL
    AND public.is_organization_admin(organization_id, auth.uid())
  );

DROP POLICY IF EXISTS "Service role manages support cases" ON public.support_cases;
CREATE POLICY "Service role manages support cases"
  ON public.support_cases FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Users can create feedback cases" ON public.feedback_cases;
CREATE POLICY "Users can create feedback cases"
  ON public.feedback_cases FOR INSERT TO authenticated
  WITH CHECK (
    reporter_user_id = auth.uid()
    AND (
      organization_id IS NULL
      OR public.is_organization_member(organization_id, auth.uid())
    )
  );

DROP POLICY IF EXISTS "Feedback owners and org admins can view feedback cases" ON public.feedback_cases;
CREATE POLICY "Feedback owners and org admins can view feedback cases"
  ON public.feedback_cases FOR SELECT TO authenticated
  USING (
    reporter_user_id = auth.uid()
    OR (
      organization_id IS NOT NULL
      AND public.is_organization_admin(organization_id, auth.uid())
    )
  );

DROP POLICY IF EXISTS "Service role manages feedback cases" ON public.feedback_cases;
CREATE POLICY "Service role manages feedback cases"
  ON public.feedback_cases FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Org admins can view release fix links" ON public.release_fix_links;
CREATE POLICY "Org admins can view release fix links"
  ON public.release_fix_links FOR SELECT TO authenticated
  USING (
    organization_id IS NOT NULL
    AND public.is_organization_admin(organization_id, auth.uid())
  );

DROP POLICY IF EXISTS "Service role manages release fix links" ON public.release_fix_links;
CREATE POLICY "Service role manages release fix links"
  ON public.release_fix_links FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- =============================================================================
-- 5. Indexes, updated_at triggers, and comments
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_organizations_slug ON public.organizations(slug);
CREATE INDEX IF NOT EXISTS idx_organization_members_user_id ON public.organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_organization_members_org_role ON public.organization_members(organization_id, role);
CREATE INDEX IF NOT EXISTS idx_audit_logs_org_created_at ON public.audit_logs(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON public.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_sso_connections_domain_active ON public.sso_connections(domain) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_sso_connections_org ON public.sso_connections(organization_id);
CREATE INDEX IF NOT EXISTS idx_profiles_external_id ON public.profiles(external_id) WHERE external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_provisioning_source ON public.profiles(provisioning_source) WHERE provisioning_source <> 'self';
CREATE INDEX IF NOT EXISTS idx_dsync_connections_org ON public.directory_sync_connections(organization_id);
CREATE INDEX IF NOT EXISTS idx_dsync_events_processed ON public.directory_sync_events(processed_at);
CREATE INDEX IF NOT EXISTS idx_security_audit_logs_created_at ON public.security_audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_audit_logs_event_type ON public.security_audit_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_enterprise_audit_events_org_created_at ON public.enterprise_audit_events(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_org_usage_ledger_org_created_at ON public.organization_usage_ledger(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_org_usage_ledger_provider_model ON public.organization_usage_ledger(provider, model);
CREATE INDEX IF NOT EXISTS idx_managed_credit_events_account_created_at ON public.managed_credit_events(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_cases_org_status ON public.support_cases(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_feedback_cases_org_status ON public.feedback_cases(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_release_fix_links_feedback_case_id ON public.release_fix_links(feedback_case_id);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  target_table text;
BEGIN
  FOREACH target_table IN ARRAY ARRAY[
    'organizations',
    'sso_connections',
    'directory_sync_connections',
    'organization_admin_policies',
    'organization_provider_policies',
    'organization_connector_policies',
    'organization_retention_policies',
    'audit_export_requests',
    'managed_credit_accounts',
    'support_cases',
    'feedback_cases',
    'release_fix_links'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_updated_at ON public.%I', target_table, target_table);
    EXECUTE format(
      'CREATE TRIGGER trg_%I_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()',
      target_table,
      target_table
    );
  END LOOP;
END $$;

COMMENT ON TABLE public.organization_admin_policies IS
  'Enterprise admin policy. Defaults keep Local/BYOK public and managed compute disabled until explicitly allowed.';
COMMENT ON TABLE public.organization_usage_ledger IS
  'Append-only usage ledger used to verify provider cost, charged amount, and managed-compute gross margin before public launch.';
COMMENT ON TABLE public.managed_credit_accounts IS
  'Managed compute credit account. public_launch_blocked defaults true to prevent accidental public credit sales.';
COMMENT ON TABLE public.enterprise_audit_events IS
  'Append-only enterprise audit stream for admin, identity, policy, support, and managed-compute actions.';
