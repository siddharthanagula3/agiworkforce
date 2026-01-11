-- Migration: Add persistent sync data storage
-- Replaces in-memory Map in API gateway with Supabase table
-- This ensures sync data survives server restarts

-- Create sync_data table for cross-device synchronization
CREATE TABLE IF NOT EXISTS sync_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    device_id TEXT NOT NULL,
    sync_type TEXT NOT NULL,
    data JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Index for efficient queries
    CONSTRAINT sync_data_user_device_idx UNIQUE (user_id, device_id, sync_type, created_at)
);

-- Index for pulling updates since a timestamp (main query pattern)
CREATE INDEX IF NOT EXISTS idx_sync_data_user_timestamp
    ON sync_data(user_id, created_at DESC);

-- Index for filtering by device
CREATE INDEX IF NOT EXISTS idx_sync_data_device
    ON sync_data(device_id, created_at DESC);

-- Enable RLS
ALTER TABLE sync_data ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only access their own sync data
CREATE POLICY sync_data_user_policy ON sync_data
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Policy: Service role has full access (for API gateway)
CREATE POLICY sync_data_service_policy ON sync_data
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Function to clean up old sync data (called by pg_cron or on insert)
CREATE OR REPLACE FUNCTION cleanup_old_sync_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Delete sync data older than 24 hours
    DELETE FROM sync_data
    WHERE created_at < now() - interval '24 hours';
END;
$$;

-- Enforce max entries per user (keeps most recent 1000)
CREATE OR REPLACE FUNCTION enforce_sync_data_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    entry_count INTEGER;
BEGIN
    -- Count entries for this user
    SELECT COUNT(*) INTO entry_count
    FROM sync_data
    WHERE user_id = NEW.user_id;

    -- If over limit, delete oldest entries
    IF entry_count > 1000 THEN
        DELETE FROM sync_data
        WHERE id IN (
            SELECT id FROM sync_data
            WHERE user_id = NEW.user_id
            ORDER BY created_at ASC
            LIMIT (entry_count - 1000)
        );
    END IF;

    RETURN NEW;
END;
$$;

-- Trigger to enforce limit on insert
CREATE TRIGGER sync_data_limit_trigger
    AFTER INSERT ON sync_data
    FOR EACH ROW
    EXECUTE FUNCTION enforce_sync_data_limit();

-- Grant access to authenticated users
GRANT SELECT, INSERT, DELETE ON sync_data TO authenticated;

-- Grant full access to service role
GRANT ALL ON sync_data TO service_role;

COMMENT ON TABLE sync_data IS 'Stores cross-device sync data with TTL-based cleanup. Replaces in-memory storage in API gateway.';
