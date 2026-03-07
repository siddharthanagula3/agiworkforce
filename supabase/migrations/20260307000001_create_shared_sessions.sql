-- Migration: Create shared_sessions table for shareable conversation links
-- Date: 2026-03-07

CREATE TABLE public.shared_sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token           TEXT NOT NULL UNIQUE,
    owner_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title           TEXT NOT NULL DEFAULT 'Shared Session',
    model_id        TEXT,
    provider        TEXT,
    messages        JSONB NOT NULL DEFAULT '[]',
    total_messages  INTEGER DEFAULT 0,
    expires_at      TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 days'),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_shared_sessions_token ON public.shared_sessions(token);
CREATE INDEX idx_shared_sessions_owner_id ON public.shared_sessions(owner_id);
CREATE INDEX idx_shared_sessions_expires_at ON public.shared_sessions(expires_at);

-- RLS: public can read non-expired sessions; owner can insert/delete
ALTER TABLE public.shared_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view non-expired shared sessions"
    ON public.shared_sessions FOR SELECT
    USING (expires_at > now());

CREATE POLICY "Authenticated users can create shared sessions"
    ON public.shared_sessions FOR INSERT
    TO authenticated
    WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Owners can delete their shared sessions"
    ON public.shared_sessions FOR DELETE
    TO authenticated
    USING (owner_id = auth.uid());

-- pg_cron cleanup job (runs daily at 3am UTC)
-- Note: pg_cron must be enabled in the Supabase project dashboard under Database > Extensions
SELECT cron.schedule(
    'cleanup-expired-shared-sessions',
    '0 3 * * *',
    $$DELETE FROM public.shared_sessions WHERE expires_at < now()$$
);
