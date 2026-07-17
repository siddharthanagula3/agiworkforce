-- Canonical Managed Cloud project columns used by the Web CRUD contract.
-- Local and BYOK projects are device-owned and never persisted in this table.

ALTER TABLE public.user_projects
  ADD COLUMN IF NOT EXISTS organization_id UUID,
  ADD COLUMN IF NOT EXISTS default_privacy_mode TEXT DEFAULT 'managed',
  ADD COLUMN IF NOT EXISTS default_provider_mode TEXT DEFAULT 'ManagedGateway',
  ADD COLUMN IF NOT EXISTS allowed_surfaces TEXT[] DEFAULT ARRAY['web', 'desktop', 'mobile']::TEXT[],
  ADD COLUMN IF NOT EXISTS default_model_id TEXT,
  ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS icon_emoji TEXT,
  ADD COLUMN IF NOT EXISTS accent_color TEXT,
  ADD COLUMN IF NOT EXISTS imported_from TEXT;

-- Repair any drift from deployments that created an earlier, unconstrained
-- version of these columns outside the canonical migration history.
UPDATE public.user_projects
SET default_privacy_mode = 'managed'
WHERE default_privacy_mode IS DISTINCT FROM 'managed';

UPDATE public.user_projects
SET default_provider_mode = 'ManagedGateway'
WHERE default_provider_mode NOT IN ('ManagedGateway', 'ManagedNative')
   OR default_provider_mode IS NULL;

UPDATE public.user_projects
SET allowed_surfaces = ARRAY['web', 'desktop', 'mobile']::TEXT[]
WHERE allowed_surfaces IS NULL
   OR cardinality(allowed_surfaces) = 0
   OR NOT (allowed_surfaces <@ ARRAY['web', 'desktop', 'mobile']::TEXT[]);

ALTER TABLE public.user_projects
  ALTER COLUMN default_privacy_mode SET DEFAULT 'managed',
  ALTER COLUMN default_privacy_mode SET NOT NULL,
  ALTER COLUMN default_provider_mode SET DEFAULT 'ManagedGateway',
  ALTER COLUMN default_provider_mode SET NOT NULL,
  ALTER COLUMN allowed_surfaces SET DEFAULT ARRAY['web', 'desktop', 'mobile']::TEXT[],
  ALTER COLUMN allowed_surfaces SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_projects_organization_fk'
  ) THEN
    ALTER TABLE public.user_projects
      ADD CONSTRAINT user_projects_organization_fk
      FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_projects_managed_privacy_check'
  ) THEN
    ALTER TABLE public.user_projects
      ADD CONSTRAINT user_projects_managed_privacy_check
      CHECK (default_privacy_mode = 'managed');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_projects_managed_provider_check'
  ) THEN
    ALTER TABLE public.user_projects
      ADD CONSTRAINT user_projects_managed_provider_check
      CHECK (default_provider_mode IN ('ManagedGateway', 'ManagedNative'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_projects_synced_surfaces_check'
  ) THEN
    ALTER TABLE public.user_projects
      ADD CONSTRAINT user_projects_synced_surfaces_check
      CHECK (
        cardinality(allowed_surfaces) > 0
        AND allowed_surfaces <@ ARRAY['web', 'desktop', 'mobile']::TEXT[]
        AND array_position(allowed_surfaces, NULL) IS NULL
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_projects_accent_color_check'
  ) THEN
    ALTER TABLE public.user_projects
      ADD CONSTRAINT user_projects_accent_color_check
      CHECK (accent_color IS NULL OR accent_color IN ('emerald', 'sky', 'amber', 'rose', 'violet', 'zinc'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_projects_import_source_check'
  ) THEN
    ALTER TABLE public.user_projects
      ADD CONSTRAINT user_projects_import_source_check
      CHECK (imported_from IS NULL OR imported_from IN ('claude', 'openai', 'manual'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_projects_icon_emoji_length_check'
  ) THEN
    ALTER TABLE public.user_projects
      ADD CONSTRAINT user_projects_icon_emoji_length_check
      CHECK (icon_emoji IS NULL OR char_length(icon_emoji) <= 16);
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_user_projects_organization_id
  ON public.user_projects(organization_id)
  WHERE organization_id IS NOT NULL;

COMMENT ON COLUMN public.user_projects.default_privacy_mode IS
  'Managed Cloud invariant. Local and BYOK projects remain device-owned.';
COMMENT ON COLUMN public.user_projects.allowed_surfaces IS
  'Only Web, Desktop Cloud, and Mobile Cloud may consume this synchronized project.';
