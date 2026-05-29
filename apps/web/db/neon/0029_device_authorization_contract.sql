-- Migration 0029: align device authorization table with current API routes
--
-- /api/device/link, /api/device/approve, and /api/device/poll use these
-- columns and require device_id to be unique for ON CONFLICT (device_id).

ALTER TABLE public.device_authorization_codes
  ADD COLUMN IF NOT EXISTS device_fingerprint text,
  ADD COLUMN IF NOT EXISTS authorized_at timestamptz,
  ADD COLUMN IF NOT EXISTS consumed_at timestamptz,
  ADD COLUMN IF NOT EXISTS denied_at timestamptz,
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz;

ALTER TABLE public.device_authorization_codes
  DROP CONSTRAINT IF EXISTS device_authorization_codes_status_check,
  ADD CONSTRAINT device_authorization_codes_status_check
  CHECK (status = ANY (ARRAY[
    'pending'::text,
    'approved'::text,
    'denied'::text,
    'expired'::text,
    'consumed'::text,
    'revoked'::text
  ]));

CREATE UNIQUE INDEX IF NOT EXISTS device_authorization_codes_device_id_unique
  ON public.device_authorization_codes (device_id);

CREATE UNIQUE INDEX IF NOT EXISTS device_authorization_codes_user_code_unique
  ON public.device_authorization_codes (user_code);

CREATE INDEX IF NOT EXISTS idx_device_auth_codes_expires_at
  ON public.device_authorization_codes (expires_at);

COMMENT ON TABLE public.device_authorization_codes IS
  'Device authorization records for desktop/CLI-style sign-in flows. Polling is scoped by device_id plus device_fingerprint and tokens are consumed once.';

COMMENT ON COLUMN public.device_authorization_codes.device_fingerprint IS
  'Client-generated fingerprint bound to the device authorization request and checked during polling.';
