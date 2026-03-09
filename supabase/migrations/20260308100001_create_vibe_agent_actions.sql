-- Migration: Create vibe_agent_actions table
-- Description: VIBE IDE agent action tracking
-- Date: 2026-03-08

CREATE TABLE IF NOT EXISTS public.vibe_agent_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES public.vibe_sessions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    agent_id TEXT NOT NULL,
    action_type TEXT NOT NULL,
    action_data JSONB DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
    created_at TIMESTAMPTZ DEFAULT now(),
    completed_at TIMESTAMPTZ,
    error TEXT
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_vibe_agent_actions_session_id ON public.vibe_agent_actions(session_id);
CREATE INDEX IF NOT EXISTS idx_vibe_agent_actions_user_id ON public.vibe_agent_actions(user_id);
CREATE INDEX IF NOT EXISTS idx_vibe_agent_actions_status ON public.vibe_agent_actions(status);
CREATE INDEX IF NOT EXISTS idx_vibe_agent_actions_created_at ON public.vibe_agent_actions(created_at DESC);

-- RLS
ALTER TABLE public.vibe_agent_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own agent actions"
    ON public.vibe_agent_actions FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own agent actions"
    ON public.vibe_agent_actions FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own agent actions"
    ON public.vibe_agent_actions FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own agent actions"
    ON public.vibe_agent_actions FOR DELETE
    USING (auth.uid() = user_id);

CREATE POLICY "Service role has full access to agent actions"
    ON public.vibe_agent_actions FOR ALL
    USING (auth.role() = 'service_role');
