-- Migration: Add security_audit_logs table
-- This table is required by the security-audit.ts service to log security events
-- Date: 2026-01-22

-- Create security_audit_logs table
CREATE TABLE IF NOT EXISTS security_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'error', 'critical')),
  ip_address TEXT,
  user_agent TEXT,
  endpoint TEXT,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add indexes for efficient querying
CREATE INDEX idx_security_audit_logs_user_id ON security_audit_logs(user_id);
CREATE INDEX idx_security_audit_logs_event_type ON security_audit_logs(event_type);
CREATE INDEX idx_security_audit_logs_severity ON security_audit_logs(severity);
CREATE INDEX idx_security_audit_logs_created_at ON security_audit_logs(created_at DESC);

-- Enable RLS
ALTER TABLE security_audit_logs ENABLE ROW LEVEL SECURITY;

-- Policy: Only service role can insert security logs
CREATE POLICY "Service role can insert security logs"
  ON security_audit_logs
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Policy: Only service role can read security logs
CREATE POLICY "Service role can read security logs"
  ON security_audit_logs
  FOR SELECT
  TO service_role
  USING (true);

-- Policy: Only service role can delete security logs (for cleanup)
CREATE POLICY "Service role can delete security logs"
  ON security_audit_logs
  FOR DELETE
  TO service_role
  USING (true);

-- Function to cleanup old security logs (keep 90 days)
CREATE OR REPLACE FUNCTION cleanup_old_security_logs()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM security_audit_logs
  WHERE created_at < NOW() - INTERVAL '90 days';

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- Grant execute to service role
GRANT EXECUTE ON FUNCTION cleanup_old_security_logs() TO service_role;

COMMENT ON TABLE security_audit_logs IS 'Stores security-related audit events for monitoring and compliance';
COMMENT ON COLUMN security_audit_logs.event_type IS 'Type of security event: auth_failed, rate_limit_exceeded, authorization_failed, suspicious_activity, csrf_violation, invalid_signature';
COMMENT ON COLUMN security_audit_logs.severity IS 'Severity level: info, warning, error, critical';
