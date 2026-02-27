-- Add conversation_tags table for auto-tagging feature
-- Stores AI-classified tags per conversation per user

CREATE TABLE IF NOT EXISTS public.conversation_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  tag TEXT NOT NULL CHECK (tag IN ('coding', 'research', 'writing', 'brainstorm', 'analysis', 'debug', 'creative', 'general')),
  confidence REAL DEFAULT 1.0,
  classified_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(conversation_id, user_id)
);

ALTER TABLE public.conversation_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own conversation tags"
  ON public.conversation_tags
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_conversation_tags_user_tag ON public.conversation_tags(user_id, tag);
CREATE INDEX idx_conversation_tags_conversation ON public.conversation_tags(conversation_id);
