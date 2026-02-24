-- SSO Connection Configuration Table
-- Stores enterprise SSO provider connections per organization

CREATE TABLE IF NOT EXISTS public.sso_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider_type TEXT NOT NULL CHECK (provider_type IN ('saml', 'oidc')),
  domain TEXT NOT NULL,
  display_name TEXT,
  metadata_url TEXT,
  metadata_xml TEXT,
  attribute_mapping JSONB DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES public.profiles(id),
  UNIQUE(domain)
);

ALTER TABLE public.sso_connections ENABLE ROW LEVEL SECURITY;

-- Only org owners/admins can view SSO connections
CREATE POLICY "Org admins can view SSO connections"
  ON public.sso_connections FOR SELECT TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = (SELECT auth.uid())
      AND role IN ('owner', 'admin')
    )
  );

-- Only org owners can manage (insert/update/delete) SSO connections
CREATE POLICY "Org owners can manage SSO connections"
  ON public.sso_connections FOR ALL TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = (SELECT auth.uid())
      AND role = 'owner'
    )
  );

-- Service role has unrestricted access for admin API operations
CREATE POLICY "Service role full access"
  ON public.sso_connections FOR ALL TO service_role
  USING (true);

-- Index for fast domain-based SSO lookup (only active connections)
CREATE INDEX idx_sso_connections_domain ON public.sso_connections(domain) WHERE is_active = true;

-- Index for listing connections per organization
CREATE INDEX idx_sso_connections_org ON public.sso_connections(organization_id);

-- Automatically update updated_at on row modification
CREATE OR REPLACE FUNCTION public.sso_connections_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER sso_connections_updated_at
  BEFORE UPDATE ON public.sso_connections
  FOR EACH ROW
  EXECUTE FUNCTION public.sso_connections_set_updated_at();

COMMENT ON TABLE public.sso_connections IS 'Enterprise SSO provider configurations per organization';
COMMENT ON COLUMN public.sso_connections.provider_type IS 'Either saml or oidc';
COMMENT ON COLUMN public.sso_connections.domain IS 'The email domain that triggers SSO (e.g. acme.com). Must be unique across all organizations.';
COMMENT ON COLUMN public.sso_connections.metadata_url IS 'URL to SAML IdP metadata XML or OIDC discovery document';
COMMENT ON COLUMN public.sso_connections.metadata_xml IS 'Raw SAML IdP metadata XML (alternative to metadata_url)';
COMMENT ON COLUMN public.sso_connections.attribute_mapping IS 'Custom SAML/OIDC attribute-to-profile-field mapping';
