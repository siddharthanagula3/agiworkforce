-- Migration: Create vibe_messages table
-- Description: Stores individual messages within vibe coding sessions
-- Date: 2026-03-05

CREATE TABLE IF NOT EXISTS public.vibe_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES public.vibe_sessions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
    content TEXT,
    content_blocks JSONB DEFAULT '[]',
    model_id TEXT,
    provider TEXT,
    tokens_input INTEGER DEFAULT 0,
    tokens_output INTEGER DEFAULT 0,
    cost_cents NUMERIC(10, 4) DEFAULT 0,
    tool_calls JSONB DEFAULT '[]',
    tool_results JSONB DEFAULT '[]',
    attachments JSONB DEFAULT '[]',
    metadata JSONB DEFAULT '{}',
    parent_message_id UUID REFERENCES public.vibe_messages(id),
    sequence_number INTEGER NOT NULL DEFAULT 0,
    duration_ms INTEGER,
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_vibe_messages_session_id ON public.vibe_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_vibe_messages_user_id ON public.vibe_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_vibe_messages_session_seq ON public.vibe_messages(session_id, sequence_number);
CREATE INDEX IF NOT EXISTS idx_vibe_messages_created_at ON public.vibe_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vibe_messages_role ON public.vibe_messages(role);

-- RLS policies
ALTER TABLE public.vibe_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view messages in their own sessions"
    ON public.vibe_messages FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can create messages in their own sessions"
    ON public.vibe_messages FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own messages"
    ON public.vibe_messages FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own messages"
    ON public.vibe_messages FOR DELETE
    USING (auth.uid() = user_id);

-- Function to auto-increment session message count and update last_activity
CREATE OR REPLACE FUNCTION public.update_vibe_session_on_message()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.vibe_sessions
    SET
        total_messages = total_messages + 1,
        total_tokens_used = total_tokens_used + COALESCE(NEW.tokens_input, 0) + COALESCE(NEW.tokens_output, 0),
        last_activity_at = now(),
        updated_at = now()
    WHERE id = NEW.session_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_vibe_message_inserted
    AFTER INSERT ON public.vibe_messages
    FOR EACH ROW
    EXECUTE FUNCTION public.update_vibe_session_on_message();
