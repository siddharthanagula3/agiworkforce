-- =============================================================================
-- JWT revocation table for kill-switch + sign-out-everywhere
-- Date: 2026-05-04
-- Source: docs/plans/redteam-services.md (red team report 2026-05-04, H7)
--
-- Background: services/api-gateway/src/routes/auth.ts issues 7-day JWTs with
-- no jti claim and no revocation set. After a token is stolen (XSS, malicious
-- browser ext, leaked localStorage), the user has no way to invalidate it
-- without disabling their account. This table backs a per-jti revocation
-- check in services/api-gateway/src/middleware/auth.ts.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.revoked_jwts (
    -- jti from the JWT header. Indexed for O(log n) lookup on every request.
    jti          text        PRIMARY KEY,
    -- The user this token belonged to. We carry it for cleanup + auditing.
    user_id      uuid        REFERENCES auth.users(id) ON DELETE CASCADE,
    -- The token's `exp` claim. We can drop rows safely once `now() > until_exp`.
    until_exp    timestamptz NOT NULL,
    -- Why was this token revoked (audit trail).
    reason       text        DEFAULT 'sign_out',
    revoked_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_revoked_jwts_user_id ON public.revoked_jwts(user_id);
CREATE INDEX IF NOT EXISTS idx_revoked_jwts_until_exp ON public.revoked_jwts(until_exp);

-- RLS: only service-role and the user themselves can list their revoked tokens.
ALTER TABLE public.revoked_jwts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own revoked tokens"
    ON public.revoked_jwts FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "Users can revoke own tokens"
    ON public.revoked_jwts FOR INSERT
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "Service role full access"
    ON public.revoked_jwts FOR ALL
    USING (auth.role() = 'service_role');

-- pg_cron cleanup: drop rows whose token is already past expiration.
-- (`pg_cron` must be enabled in Database > Extensions in the Supabase
-- dashboard. If it isn't, the application can run an equivalent DELETE in a
-- maintenance window.)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        PERFORM cron.schedule(
            'cleanup-revoked-jwts',
            '0 4 * * *',
            $$DELETE FROM public.revoked_jwts WHERE until_exp < now()$$
        );
    END IF;
END $$;
