-- 20260101000003_add_stripe_integration.sql
-- Fix missing Stripe integration components:
-- 1. Add stripe_customer_id to profiles table
-- 2. Create process_stripe_event_idempotent RPC function

-- =============================================================================
-- 1. Add stripe_customer_id column to profiles table
-- =============================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public'
                 AND table_name = 'profiles'
                 AND column_name = 'stripe_customer_id') THEN
    ALTER TABLE public.profiles ADD COLUMN stripe_customer_id text;

    -- Create index for efficient lookup by stripe_customer_id
    CREATE INDEX IF NOT EXISTS idx_profiles_stripe_customer_id
      ON public.profiles(stripe_customer_id);

    RAISE NOTICE 'Added stripe_customer_id column to profiles table';
  ELSE
    RAISE NOTICE 'stripe_customer_id column already exists in profiles table';
  END IF;
END $$;

-- =============================================================================
-- 2. Create process_stripe_event_idempotent function
-- This function ensures each Stripe webhook event is only processed once.
-- Returns TRUE if the event should be processed (first time seeing it).
-- Returns FALSE if the event has already been processed.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.process_stripe_event_idempotent(p_event_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row_count INTEGER;
BEGIN
  -- Attempt to insert the event_id into processed_stripe_events
  -- ON CONFLICT DO NOTHING means if it already exists, nothing happens
  INSERT INTO public.processed_stripe_events (event_id, processed_at)
  VALUES (p_event_id, NOW())
  ON CONFLICT (event_id) DO NOTHING;

  -- Check if we actually inserted a row (GET DIAGNOSTICS)
  GET DIAGNOSTICS v_row_count = ROW_COUNT;

  -- Return TRUE if row was inserted (should process), FALSE if already existed
  RETURN v_row_count > 0;
END;
$$;

-- Grant execute permission to service_role
GRANT EXECUTE ON FUNCTION public.process_stripe_event_idempotent(TEXT) TO service_role;

-- =============================================================================
-- 3. Create helper function to look up user by stripe_customer_id
-- =============================================================================
CREATE OR REPLACE FUNCTION public.get_user_by_stripe_customer_id(p_customer_id TEXT)
RETURNS TABLE (
  user_id UUID,
  email TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT p.id, p.email
  FROM public.profiles p
  WHERE p.stripe_customer_id = p_customer_id
  LIMIT 1;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.get_user_by_stripe_customer_id(TEXT) TO service_role;

-- =============================================================================
-- 4. Create function to link stripe_customer_id to profile
-- =============================================================================
CREATE OR REPLACE FUNCTION public.link_stripe_customer(
  p_user_id UUID,
  p_customer_id TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET stripe_customer_id = p_customer_id,
      updated_at = NOW()
  WHERE id = p_user_id;

  RETURN FOUND;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.link_stripe_customer(UUID, TEXT) TO service_role;

-- =============================================================================
-- 5. Verify processed_stripe_events table has proper RLS
-- =============================================================================
ALTER TABLE public.processed_stripe_events ENABLE ROW LEVEL SECURITY;

-- Ensure service role policy exists
DROP POLICY IF EXISTS "Service role manages stripe events" ON public.processed_stripe_events;
CREATE POLICY "Service role manages stripe events"
  ON public.processed_stripe_events FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- =============================================================================
-- 6. Add comment for documentation
-- =============================================================================
COMMENT ON FUNCTION public.process_stripe_event_idempotent(TEXT) IS
  'Idempotency check for Stripe webhook events. Returns TRUE if this is the first time processing the event, FALSE if already processed.';

COMMENT ON COLUMN public.profiles.stripe_customer_id IS
  'The Stripe customer ID associated with this user for reliable customer-to-user mapping.';
