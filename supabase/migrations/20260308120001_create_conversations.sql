-- Sprint 3: Conversations table for cross-surface conversation sync
-- Supports desktop, web, mobile, extension, and vscode sources

CREATE TABLE IF NOT EXISTS public.conversations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text,
  model text,
  provider text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  last_message_at timestamptz,
  message_count int DEFAULT 0,
  metadata jsonb DEFAULT '{}',
  source text DEFAULT 'desktop' CHECK (source IN ('desktop','web','mobile','extension','vscode'))
);

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

-- User CRUD own rows
CREATE POLICY "Users can CRUD own conversations" ON public.conversations
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Service role bypass
CREATE POLICY "Service role full access on conversations" ON public.conversations
  FOR ALL USING (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON public.conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON public.conversations(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_last_message_at ON public.conversations(last_message_at DESC NULLS LAST);

-- Auto-update updated_at on any change
CREATE OR REPLACE FUNCTION public.update_conversations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_conversations_updated_at ON public.conversations;
CREATE TRIGGER trigger_conversations_updated_at
    BEFORE UPDATE ON public.conversations
    FOR EACH ROW
    EXECUTE FUNCTION public.update_conversations_updated_at();

-- Enable Realtime for cross-surface sync
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
