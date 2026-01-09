-- Fix device authorization flow to match API + desktop expectations.
-- Adds missing columns, enforces uniqueness, and aligns status values.

ALTER TABLE public.device_authorization_codes
  ADD COLUMN IF NOT EXISTS device_fingerprint text,
  ADD COLUMN IF NOT EXISTS access_token text,
  ADD COLUMN IF NOT EXISTS refresh_token text,
  ADD COLUMN IF NOT EXISTS user_email text,
  ADD COLUMN IF NOT EXISTS user_name text,
  ADD COLUMN IF NOT EXISTS consumed_at timestamptz,
  ADD COLUMN IF NOT EXISTS denied_at timestamptz,
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz;

-- Align status values with API (pending/approved/denied/expired/revoked/consumed)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'device_authorization_codes'
      AND c.conname = 'device_authorization_codes_status_check'
  ) THEN
    ALTER TABLE public.device_authorization_codes
      DROP CONSTRAINT device_authorization_codes_status_check;
  END IF;
END
$$;

ALTER TABLE public.device_authorization_codes
  ADD CONSTRAINT device_authorization_codes_status_check
  CHECK (status = ANY (ARRAY['pending'::text, 'approved'::text, 'denied'::text, 'expired'::text, 'revoked'::text, 'consumed'::text]));

-- Enforce uniqueness required by API code paths (poll uses .single())
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'device_authorization_codes'
      AND c.conname = 'device_authorization_codes_device_id_key'
  ) THEN
    ALTER TABLE public.device_authorization_codes
      ADD CONSTRAINT device_authorization_codes_device_id_key UNIQUE (device_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'device_authorization_codes'
      AND c.conname = 'device_authorization_codes_user_code_key'
  ) THEN
    ALTER TABLE public.device_authorization_codes
      ADD CONSTRAINT device_authorization_codes_user_code_key UNIQUE (user_code);
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_device_auth_expires_at ON public.device_authorization_codes (expires_at);


