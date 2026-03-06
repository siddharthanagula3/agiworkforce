-- Migration: Create vibe_sessions table
-- Description: Stores vibe coding session metadata for the desktop app
-- Date: 2026-03-05

CREATE TABLE IF NOT EXISTS public.vibe_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT 'Untitled Session',
    description TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'archived')),
    model_id TEXT,
    provider TEXT,
    goal TEXT,
    project_path TEXT,
    tags TEXT[] DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    total_messages INTEGER DEFAULT 0,
    total_tokens_used BIGINT DEFAULT 0,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_vibe_sessions_user_id ON public.vibe_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_vibe_sessions_status ON public.vibe_sessions(status);
CREATE INDEX IF NOT EXISTS idx_vibe_sessions_last_activity ON public.vibe_sessions(last_activity_at DESC);
CREATE INDEX IF NOT EXISTS idx_vibe_sessions_user_status ON public.vibe_sessions(user_id, status);

-- RLS policies
ALTER TABLE public.vibe_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own vibe sessions"
    ON public.vibe_sessions FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own vibe sessions"
    ON public.vibe_sessions FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own vibe sessions"
    ON public.vibe_sessions FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own vibe sessions"
    ON public.vibe_sessions FOR DELETE
    USING (auth.uid() = user_id);

-- Auto-update updated_at trigger
CREATE OR REPLACE FUNCTION public.update_vibe_session_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_vibe_sessions_updated_at
    BEFORE UPDATE ON public.vibe_sessions
    FOR EACH ROW
    EXECUTE FUNCTION public.update_vibe_session_updated_at();
