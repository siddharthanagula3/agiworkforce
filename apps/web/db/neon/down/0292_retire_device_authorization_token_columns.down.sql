-- Reversal restores the two empty legacy columns and the old RPC body. It cannot
-- restore any bearer values; the up migration refuses non-NULL values before dropping.

BEGIN;

ALTER TABLE public.device_authorization_codes
  ADD COLUMN access_token text,
  ADD COLUMN refresh_token text;

CREATE OR REPLACE FUNCTION public.consume_device_authorization_tokens(
  p_device_id text
)
RETURNS TABLE(
  status text,
  user_id text,
  user_email text,
  user_name text,
  access_token text,
  refresh_token text
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_rec record;
BEGIN
  SELECT
    dac.status,
    dac.expires_at,
    dac.user_id,
    dac.user_email,
    dac.user_name,
    dac.access_token,
    dac.refresh_token
  INTO v_rec
  FROM public.device_authorization_codes dac
  WHERE dac.device_id = p_device_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_rec.expires_at IS NOT NULL AND v_rec.expires_at < now() THEN
    UPDATE public.device_authorization_codes d
    SET status = 'expired',
        updated_at = now()
    WHERE d.device_id = p_device_id
      AND d.status IN ('pending', 'approved');

    RETURN QUERY
      SELECT 'expired'::text, v_rec.user_id::text,
             v_rec.user_email, v_rec.user_name,
             NULL::text, NULL::text;
    RETURN;
  END IF;

  IF v_rec.status <> 'approved' THEN
    RETURN QUERY
      SELECT v_rec.status::text, v_rec.user_id::text,
             v_rec.user_email, v_rec.user_name,
             NULL::text, NULL::text;
    RETURN;
  END IF;

  UPDATE public.device_authorization_codes d
  SET status = 'consumed',
      consumed_at = now(),
      access_token = null,
      refresh_token = null,
      updated_at = now()
  WHERE d.device_id = p_device_id
    AND d.status = 'approved';

  RETURN QUERY
    SELECT 'approved'::text, v_rec.user_id::text,
           v_rec.user_email, v_rec.user_name,
           v_rec.access_token::text,
           v_rec.refresh_token::text;
END;
$$;

DELETE FROM public.schema_migrations
 WHERE filename = '0292_retire_device_authorization_token_columns.sql';

COMMIT;
