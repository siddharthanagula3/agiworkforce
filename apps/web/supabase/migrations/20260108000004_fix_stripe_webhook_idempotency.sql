-- 20260108000004_fix_stripe_webhook_idempotency.sql
-- Fix Stripe webhook idempotency to be retry-safe:
-- - Track status: processing | succeeded | failed
-- - Allow retries when previous attempt failed
-- - Avoid duplicate concurrent processing via a soft lock (locked_at)

-- =============================================================================
-- 1. Extend processed_stripe_events table to support status tracking
-- =============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'processed_stripe_events'
      AND column_name = 'status'
  ) THEN
    -- Existing rows represent "seen" events under the old implementation.
    -- Default to 'succeeded' to preserve historical skip behavior.
    ALTER TABLE public.processed_stripe_events
      ADD COLUMN status text NOT NULL DEFAULT 'succeeded';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'processed_stripe_events'
      AND column_name = 'attempts'
  ) THEN
    ALTER TABLE public.processed_stripe_events
      ADD COLUMN attempts integer NOT NULL DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'processed_stripe_events'
      AND column_name = 'locked_at'
  ) THEN
    ALTER TABLE public.processed_stripe_events
      ADD COLUMN locked_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'processed_stripe_events'
      AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE public.processed_stripe_events
      ADD COLUMN updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now());
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'processed_stripe_events'
      AND column_name = 'last_error'
  ) THEN
    ALTER TABLE public.processed_stripe_events
      ADD COLUMN last_error text;
  END IF;
END $$;

-- Validate status values (safe re-run: drop/recreate)
ALTER TABLE public.processed_stripe_events
  DROP CONSTRAINT IF EXISTS processed_stripe_events_status_check;

ALTER TABLE public.processed_stripe_events
  ADD CONSTRAINT processed_stripe_events_status_check
  CHECK (status = ANY (ARRAY['processing'::text, 'succeeded'::text, 'failed'::text]));

CREATE INDEX IF NOT EXISTS idx_processed_stripe_events_status
  ON public.processed_stripe_events(status);

CREATE INDEX IF NOT EXISTS idx_processed_stripe_events_locked_at
  ON public.processed_stripe_events(locked_at);

-- =============================================================================
-- 2. Replace idempotency function: claim processing safely and allow retries
-- Returns TRUE if the event should be processed now.
-- Returns FALSE if it was already succeeded OR another worker is currently processing it.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.process_stripe_event_idempotent(p_event_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status TEXT;
  v_locked_at timestamptz;
  v_now timestamptz := timezone('utc'::text, now());
  v_lock_stale_interval interval := interval '10 minutes';
BEGIN
  -- Try to claim by inserting a new row in "processing" state
  INSERT INTO public.processed_stripe_events (
    event_id,
    processed_at,
    status,
    attempts,
    locked_at,
    updated_at,
    last_error
  )
  VALUES (
    p_event_id,
    v_now,
    'processing',
    1,
    v_now,
    v_now,
    NULL
  )
  ON CONFLICT (event_id) DO NOTHING;

  IF FOUND THEN
    RETURN TRUE;
  END IF;

  -- Existing row: decide based on status and lock freshness
  SELECT status, locked_at
    INTO v_status, v_locked_at
  FROM public.processed_stripe_events
  WHERE event_id = p_event_id;

  IF v_status = 'succeeded' THEN
    RETURN FALSE;
  END IF;

  -- If another worker is processing and lock is fresh, do not process concurrently.
  IF v_status = 'processing'
     AND v_locked_at IS NOT NULL
     AND v_locked_at > (v_now - v_lock_stale_interval) THEN
    RETURN FALSE;
  END IF;

  -- Retry: either failed OR stale-processing. Re-claim the lock.
  UPDATE public.processed_stripe_events
  SET status = 'processing',
      attempts = COALESCE(attempts, 0) + 1,
      locked_at = v_now,
      updated_at = v_now
  WHERE event_id = p_event_id;

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_stripe_event_idempotent(TEXT) TO service_role;

-- =============================================================================
-- 3. Mark success/failure after processing (so failures can retry)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.mark_stripe_event_succeeded(p_event_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.processed_stripe_events
  SET status = 'succeeded',
      updated_at = timezone('utc'::text, now()),
      last_error = NULL
  WHERE event_id = p_event_id;

  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_stripe_event_succeeded(TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.mark_stripe_event_failed(p_event_id TEXT, p_error TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.processed_stripe_events
  SET status = 'failed',
      updated_at = timezone('utc'::text, now()),
      last_error = LEFT(p_error, 4000)
  WHERE event_id = p_event_id;

  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_stripe_event_failed(TEXT, TEXT) TO service_role;

COMMENT ON FUNCTION public.process_stripe_event_idempotent(TEXT) IS
  'Retry-safe idempotency claim for Stripe events. Returns TRUE if the caller should process now. Uses status tracking + soft lock.';

COMMENT ON FUNCTION public.mark_stripe_event_succeeded(TEXT) IS
  'Marks a Stripe event as successfully processed (status=succeeded).';

COMMENT ON FUNCTION public.mark_stripe_event_failed(TEXT, TEXT) IS
  'Marks a Stripe event as failed (status=failed) so retries can reprocess.';


