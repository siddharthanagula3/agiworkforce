-- 20260108000003_add_device_token_consumption_rpc.sql
-- Atomically consume device authorization tokens (one-time retrieval) to prevent double-poll token leaks.

CREATE OR REPLACE FUNCTION public.consume_device_authorization_tokens(p_device_id TEXT)
RETURNS TABLE (
  status TEXT,
  user_id UUID,
  user_email TEXT,
  user_name TEXT,
  access_token TEXT,
  refresh_token TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec RECORD;
BEGIN
  -- Lock the row to ensure only one poll can consume tokens
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

  -- Expiry check (treat already-consumed as expired at API layer)
  IF v_rec.expires_at IS NOT NULL AND v_rec.expires_at < NOW() THEN
    UPDATE public.device_authorization_codes
    SET status = 'expired',
        updated_at = NOW()
    WHERE device_id = p_device_id
      AND status IN ('pending', 'approved');

    RETURN QUERY
      SELECT 'expired'::text, v_rec.user_id, v_rec.user_email, v_rec.user_name, NULL::text, NULL::text;
    RETURN;
  END IF;

  -- Only approved codes can be consumed for tokens
  IF v_rec.status <> 'approved' THEN
    RETURN QUERY
      SELECT v_rec.status::text, v_rec.user_id, v_rec.user_email, v_rec.user_name, NULL::text, NULL::text;
    RETURN;
  END IF;

  -- Consume: flip status + clear tokens so future polls cannot retrieve again.
  UPDATE public.device_authorization_codes
  SET status = 'consumed',
      consumed_at = NOW(),
      access_token = NULL,
      refresh_token = NULL,
      updated_at = NOW()
  WHERE device_id = p_device_id
    AND status = 'approved';

  -- Return the tokens captured before clearing
  RETURN QUERY
    SELECT 'approved'::text,
           v_rec.user_id,
           v_rec.user_email,
           v_rec.user_name,
           v_rec.access_token::text,
           v_rec.refresh_token::text;
END;
$$;

GRANT EXECUTE ON FUNCTION public.consume_device_authorization_tokens(TEXT) TO service_role;

COMMENT ON FUNCTION public.consume_device_authorization_tokens(TEXT) IS
  'Atomically consumes a device authorization code (approved->consumed) and returns the tokens exactly once.';


