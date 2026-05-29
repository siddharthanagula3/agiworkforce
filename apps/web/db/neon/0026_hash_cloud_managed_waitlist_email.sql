-- Migration 0026: hash Cloud Managed waitlist emails
--
-- Aligns the Neon schema with POST /api/waitlist/cloud-managed and the
-- server-side waitlist service. Plaintext emails are backfilled into
-- email_hash/email_prefix, then removed.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE public.cloud_managed_waitlist
  ADD COLUMN IF NOT EXISTS email_hash text,
  ADD COLUMN IF NOT EXISTS email_prefix text;

UPDATE public.cloud_managed_waitlist
SET
  email_hash = COALESCE(email_hash, encode(digest(lower(btrim(email)), 'sha256'), 'hex')),
  email_prefix = COALESCE(email_prefix, left(split_part(lower(btrim(email)), '@', 1), 3))
WHERE email IS NOT NULL;

WITH duplicate_waitlist_rows AS (
  SELECT
    ctid,
    row_number() OVER (
      PARTITION BY email_hash, source
      ORDER BY joined_at ASC, id ASC
    ) AS duplicate_rank
  FROM public.cloud_managed_waitlist
)
DELETE FROM public.cloud_managed_waitlist AS waitlist
USING duplicate_waitlist_rows AS duplicate
WHERE waitlist.ctid = duplicate.ctid
  AND duplicate.duplicate_rank > 1;

ALTER TABLE public.cloud_managed_waitlist
  ALTER COLUMN email_hash SET NOT NULL,
  ALTER COLUMN email_prefix SET NOT NULL;

ALTER TABLE public.cloud_managed_waitlist
  DROP CONSTRAINT IF EXISTS cloud_managed_waitlist_email_source_unique,
  DROP CONSTRAINT IF EXISTS cloud_managed_waitlist_unique,
  ADD CONSTRAINT cloud_managed_waitlist_email_hash_source_unique UNIQUE (email_hash, source);

ALTER TABLE public.cloud_managed_waitlist
  DROP COLUMN IF EXISTS email;

COMMENT ON TABLE public.cloud_managed_waitlist IS
  'Cloud Managed private beta waitlist signups. Emails are SHA-256 hashed before storage.';
