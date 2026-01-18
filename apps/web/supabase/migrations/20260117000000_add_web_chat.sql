-- Web Chat Schema
-- Creates tables for web-based chat conversations

-- Conversations table
CREATE TABLE IF NOT EXISTS public.web_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT 'New conversation',
    model TEXT DEFAULT 'auto',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- Messages table
CREATE TABLE IF NOT EXISTS public.web_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES public.web_conversations(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    model TEXT,
    provider TEXT,
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    cost_cents NUMERIC(10, 4) DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_web_conversations_user_id ON public.web_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_web_conversations_updated_at ON public.web_conversations(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_web_messages_conversation_id ON public.web_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_web_messages_created_at ON public.web_messages(created_at);

-- Enable RLS
ALTER TABLE public.web_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.web_messages ENABLE ROW LEVEL SECURITY;

-- RLS Policies for web_conversations
CREATE POLICY "Users can view their own conversations"
    ON public.web_conversations FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own conversations"
    ON public.web_conversations FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own conversations"
    ON public.web_conversations FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own conversations"
    ON public.web_conversations FOR DELETE
    USING (auth.uid() = user_id);

-- RLS Policies for web_messages
CREATE POLICY "Users can view messages in their conversations"
    ON public.web_messages FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.web_conversations c
            WHERE c.id = conversation_id AND c.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can create messages in their conversations"
    ON public.web_messages FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.web_conversations c
            WHERE c.id = conversation_id AND c.user_id = auth.uid()
        )
    );

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_web_conversation_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.web_conversations
    SET updated_at = NOW()
    WHERE id = NEW.conversation_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_conversation_on_message
    AFTER INSERT ON public.web_messages
    FOR EACH ROW
    EXECUTE FUNCTION update_web_conversation_timestamp();

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.web_conversations TO authenticated;
GRANT SELECT, INSERT ON public.web_messages TO authenticated;
