-- Migration: Add mobile_devices table for persistent mobile client registration
-- Replaces in-memory Map in API gateway with Supabase table
-- This ensures mobile device registrations survive server restarts

-- Create mobile_devices table
CREATE TABLE IF NOT EXISTS public.mobile_devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    platform TEXT NOT NULL,
    name TEXT NOT NULL,
    push_token TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.mobile_devices IS
    'Stores mobile device registrations for cross-device sync and push notifications.';

-- Index for user lookups (most common query pattern)
CREATE INDEX IF NOT EXISTS idx_mobile_devices_user_id
    ON public.mobile_devices(user_id);

-- Index for push token lookups
CREATE INDEX IF NOT EXISTS idx_mobile_devices_push_token
    ON public.mobile_devices(push_token)
    WHERE push_token IS NOT NULL;

-- Enable RLS
ALTER TABLE public.mobile_devices ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own devices
CREATE POLICY mobile_devices_select_policy
    ON public.mobile_devices
    FOR SELECT
    TO authenticated
    USING ((SELECT auth.uid()) = user_id);

-- Policy: Users can insert their own devices
CREATE POLICY mobile_devices_insert_policy
    ON public.mobile_devices
    FOR INSERT
    TO authenticated
    WITH CHECK ((SELECT auth.uid()) = user_id);

-- Policy: Users can update their own devices
CREATE POLICY mobile_devices_update_policy
    ON public.mobile_devices
    FOR UPDATE
    TO authenticated
    USING ((SELECT auth.uid()) = user_id)
    WITH CHECK ((SELECT auth.uid()) = user_id);

-- Policy: Users can delete their own devices
CREATE POLICY mobile_devices_delete_policy
    ON public.mobile_devices
    FOR DELETE
    TO authenticated
    USING ((SELECT auth.uid()) = user_id);

-- Policy: Service role has full access (for API gateway)
CREATE POLICY mobile_devices_service_policy
    ON public.mobile_devices
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Auto-update updated_at on changes
CREATE OR REPLACE FUNCTION public.update_mobile_devices_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_mobile_devices_updated_at ON public.mobile_devices;
CREATE TRIGGER update_mobile_devices_updated_at
    BEFORE UPDATE ON public.mobile_devices
    FOR EACH ROW
    EXECUTE FUNCTION public.update_mobile_devices_updated_at();

-- Grant access to authenticated users (RLS enforces per-user access)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mobile_devices TO authenticated;

-- Grant full access to service role
GRANT ALL ON public.mobile_devices TO service_role;
