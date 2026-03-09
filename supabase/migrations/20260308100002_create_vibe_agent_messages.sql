-- Migration: Create vibe_agent_messages table
-- Description: VIBE IDE agent message log
-- Date: 2026-03-08

CREATE TABLE IF NOT EXISTS public.vibe_agent_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES public.vibe_sessions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    agent_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
    content TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_vibe_agent_messages_session_id ON public.vibe_agent_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_vibe_agent_messages_user_id ON public.vibe_agent_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_vibe_agent_messages_created_at ON public.vibe_agent_messages(created_at DESC);

-- RLS
ALTER TABLE public.vibe_agent_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own agent messages"
    ON public.vibe_agent_messages FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own agent messages"
    ON public.vibe_agent_messages FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own agent messages"
    ON public.vibe_agent_messages FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own agent messages"
    ON public.vibe_agent_messages FOR DELETE
    USING (auth.uid() = user_id);

CREATE POLICY "Service role has full access to agent messages"
    ON public.vibe_agent_messages FOR ALL
    USING (auth.role() = 'service_role');
