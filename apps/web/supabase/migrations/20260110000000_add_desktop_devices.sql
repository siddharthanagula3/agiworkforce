-- Migration: Add desktop_devices table for persistent desktop client registration
-- Fixes: C3 In-Memory State Loss - desktop registrations were lost on server restart
-- This table stores registered desktop clients with proper persistence and RLS

-- Create desktop_devices table
CREATE TABLE IF NOT EXISTS public.desktop_devices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(name) >= 1 AND char_length(name) <= 100),
  platform TEXT NOT NULL CHECK (platform IN ('macos', 'windows', 'linux')),
  version TEXT NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add comment for documentation
COMMENT ON TABLE public.desktop_devices IS
  'Registered desktop clients. Used by API gateway for desktop synchronization.';

-- Index for user lookup (most common query pattern)
CREATE INDEX IF NOT EXISTS idx_desktop_devices_user_id
  ON public.desktop_devices(user_id);

-- Index for last_seen filtering (for online status checks)
CREATE INDEX IF NOT EXISTS idx_desktop_devices_last_seen
  ON public.desktop_devices(last_seen_at DESC);

-- Enable RLS
ALTER TABLE public.desktop_devices ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Users can view their own desktop devices
CREATE POLICY "Users can view their own desktop devices"
  ON public.desktop_devices
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own desktop devices
CREATE POLICY "Users can register their own desktop devices"
  ON public.desktop_devices
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own desktop devices (for heartbeat/last_seen)
CREATE POLICY "Users can update their own desktop devices"
  ON public.desktop_devices
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own desktop devices
CREATE POLICY "Users can delete their own desktop devices"
  ON public.desktop_devices
  FOR DELETE
  USING (auth.uid() = user_id);

-- Service role has full access (for API gateway using service_role key)
CREATE POLICY "Service role can manage all desktop devices"
  ON public.desktop_devices
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION public.update_desktop_devices_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_desktop_devices_updated_at ON public.desktop_devices;
CREATE TRIGGER update_desktop_devices_updated_at
  BEFORE UPDATE ON public.desktop_devices
  FOR EACH ROW
  EXECUTE FUNCTION public.update_desktop_devices_updated_at();

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.desktop_devices TO authenticated;
GRANT ALL ON public.desktop_devices TO service_role;
