-- Add metadata jsonb column to web_messages for storing per-message data
-- (reactions, custom fields) using a read-merge-write pattern to preserve
-- existing fields across partial patches.

ALTER TABLE public.web_messages
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

-- Index for efficient lookups on common metadata fields (reaction type)
CREATE INDEX IF NOT EXISTS idx_web_messages_metadata ON public.web_messages
  USING gin (metadata);
