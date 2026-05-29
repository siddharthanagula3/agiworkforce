-- Migration 0027: restore Cloud Managed waitlist email storage
--
-- Cloud Managed is an invite/waitlist funnel. Launch operations must be able
-- to email visitors who opt in, so the Neon schema stores normalized plaintext
-- email addresses again. The hash columns from 0026 remain as nullable legacy
-- columns so applying this migration is non-destructive.

ALTER TABLE public.cloud_managed_waitlist
  ADD COLUMN IF NOT EXISTS email text;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'cloud_managed_waitlist'
      AND column_name = 'email_hash'
  ) THEN
    ALTER TABLE public.cloud_managed_waitlist
      ALTER COLUMN email_hash DROP NOT NULL;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'cloud_managed_waitlist'
      AND column_name = 'email_prefix'
  ) THEN
    ALTER TABLE public.cloud_managed_waitlist
      ALTER COLUMN email_prefix DROP NOT NULL;
  END IF;
END $$;

ALTER TABLE public.cloud_managed_waitlist
  DROP CONSTRAINT IF EXISTS cloud_managed_waitlist_email_hash_source_unique,
  DROP CONSTRAINT IF EXISTS cloud_managed_waitlist_unique,
  ADD CONSTRAINT cloud_managed_waitlist_email_source_unique UNIQUE (email, source);

COMMENT ON TABLE public.cloud_managed_waitlist IS
  'Cloud Managed private beta waitlist signups. Stores normalized visitor email for invite/release notifications.';

COMMENT ON COLUMN public.cloud_managed_waitlist.email IS
  'Lowercased and trimmed visitor email address used for launch and invite notifications.';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'cloud_managed_waitlist'
      AND column_name = 'email_hash'
  ) THEN
    COMMENT ON COLUMN public.cloud_managed_waitlist.email_hash IS
      'Legacy hash column from the temporary hash-only waitlist design. Nullable and not used by current signup routes.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'cloud_managed_waitlist'
      AND column_name = 'email_prefix'
  ) THEN
    COMMENT ON COLUMN public.cloud_managed_waitlist.email_prefix IS
      'Legacy display-prefix column from the temporary hash-only waitlist design. Nullable and not used by current signup routes.';
  END IF;
END $$;
