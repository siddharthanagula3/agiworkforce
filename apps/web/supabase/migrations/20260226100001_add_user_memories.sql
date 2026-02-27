-- User memories table for shared cloud memory between desktop and mobile
CREATE TABLE IF NOT EXISTS public.user_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  content TEXT NOT NULL,
  category TEXT,
  source TEXT DEFAULT 'mobile' CHECK (source IN ('mobile', 'desktop', 'web', 'auto')),
  is_deleted BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.user_memories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own memories"
  ON public.user_memories
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_user_memories_user ON public.user_memories(user_id, updated_at DESC);
CREATE INDEX idx_user_memories_search ON public.user_memories USING gin(to_tsvector('english', content));
