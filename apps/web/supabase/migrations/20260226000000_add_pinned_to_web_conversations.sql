-- Add pinned column to web_conversations for mobile + web sidebar ordering.
-- Pinned conversations appear first, then sorted by updated_at descending.

ALTER TABLE public.web_conversations
  ADD COLUMN IF NOT EXISTS pinned BOOLEAN DEFAULT FALSE;

-- Composite index: user_id + pinned DESC + updated_at DESC
-- Covers the sidebar query: WHERE user_id = ? ORDER BY pinned DESC, updated_at DESC
CREATE INDEX IF NOT EXISTS idx_web_conversations_pinned
  ON public.web_conversations (user_id, pinned DESC, updated_at DESC);
