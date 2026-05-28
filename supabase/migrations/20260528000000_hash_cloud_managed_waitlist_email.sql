-- 20260528000000_hash_cloud_managed_waitlist_email.sql
--
-- Remove plaintext email storage from the Cloud Managed waitlist.
-- The public API hashes emails before insert; this migration brings the
-- canonical Supabase schema and RLS policy in line with that runtime contract.

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

DROP POLICY IF EXISTS "Anyone can join waitlist" ON public.cloud_managed_waitlist;

CREATE POLICY "Anyone can join waitlist"
  ON public.cloud_managed_waitlist
  FOR INSERT
  WITH CHECK (
    email_hash ~ '^[0-9a-f]{64}$'
    AND length(email_prefix) BETWEEN 1 AND 3
    AND source IN ('byok', 'sync', 'billing', 'other')
  );

ALTER TABLE public.cloud_managed_waitlist
  DROP COLUMN IF EXISTS email;

COMMENT ON TABLE public.cloud_managed_waitlist IS
  'Cloud Managed private beta waitlist signups. Emails are SHA-256 hashed before storage; insert-open; read locked to service role.';

COMMENT ON COLUMN public.cloud_managed_waitlist.email_hash IS
  'SHA-256 hash of lowercased and trimmed signup email.';

COMMENT ON COLUMN public.cloud_managed_waitlist.email_prefix IS
  'First three characters of the normalized local-part for limited support display without plaintext email storage.';
