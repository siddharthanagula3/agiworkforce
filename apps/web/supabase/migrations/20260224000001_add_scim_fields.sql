-- SCIM Provisioning Support
-- Adds fields for tracking externally-provisioned users and directory sync state

-- Add SCIM fields to profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS external_id TEXT,
ADD COLUMN IF NOT EXISTS provisioning_source TEXT CHECK (provisioning_source IN ('self', 'scim', 'sso_jit', 'admin')) DEFAULT 'self',
ADD COLUMN IF NOT EXISTS provisioned_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS department TEXT,
ADD COLUMN IF NOT EXISTS job_title TEXT;

CREATE INDEX IF NOT EXISTS idx_profiles_external_id ON public.profiles(external_id) WHERE external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_provisioning_source ON public.profiles(provisioning_source) WHERE provisioning_source != 'self';

-- Add provisioning fields to organization_members
ALTER TABLE public.organization_members
ADD COLUMN IF NOT EXISTS provisioned_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS provisioning_source TEXT DEFAULT 'manual';

-- Directory sync connections table
CREATE TABLE IF NOT EXISTS public.directory_sync_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('okta', 'azure_ad', 'google', 'onelogin', 'generic_scim')),
  directory_id TEXT NOT NULL,
  display_name TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(directory_id)
);

ALTER TABLE public.directory_sync_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org admins view directory connections"
  ON public.directory_sync_connections FOR SELECT TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = (SELECT auth.uid()) AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Service role full access"
  ON public.directory_sync_connections FOR ALL TO service_role
  USING (true);

-- Processed directory sync events (idempotency)
CREATE TABLE IF NOT EXISTS public.directory_sync_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id TEXT UNIQUE NOT NULL,
  event_type TEXT NOT NULL,
  directory_id TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload JSONB
);

ALTER TABLE public.directory_sync_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only"
  ON public.directory_sync_events FOR ALL TO service_role
  USING (true);

-- Cleanup old events after 30 days
CREATE INDEX IF NOT EXISTS idx_dsync_events_processed ON public.directory_sync_events(processed_at);
