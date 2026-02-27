-- ============================================================================
-- Migration: Fix 4 NEEDS_HUMAN database issues for mobile app schema
-- Timestamp: 20260226200000
--
-- Fixes:
--   H26  — conversation_tags.conversation_id missing FK to web_conversations
--   H31  — schedule_runs missing index on user_id (RLS full-table-scan)
--   M10  — updated_at triggers missing on messaging_connections,
--           user_memories, and scheduled_tasks
--   M11  — conversation_tags.confidence has no bounds CHECK constraint
-- ============================================================================


-- ---------------------------------------------------------------------------
-- H26: Add missing foreign key from conversation_tags → web_conversations
-- ---------------------------------------------------------------------------
-- The conversation_tags table (20260226100003) declares conversation_id as
-- UUID NOT NULL but never references the parent table. This allows orphan
-- rows and breaks referential integrity.
ALTER TABLE public.conversation_tags
  ADD CONSTRAINT fk_conversation_tags_conversation
  FOREIGN KEY (conversation_id)
  REFERENCES public.web_conversations(id)
  ON DELETE CASCADE;


-- ---------------------------------------------------------------------------
-- H31: Add index on schedule_runs.user_id for RLS performance
-- ---------------------------------------------------------------------------
-- The RLS policy "Users can view their own schedule runs" filters on
-- auth.uid() = user_id. Without an index the planner must seq-scan the
-- entire table for every authenticated request.
CREATE INDEX IF NOT EXISTS idx_schedule_runs_user
  ON public.schedule_runs(user_id);


-- ---------------------------------------------------------------------------
-- M10: Create shared updated_at trigger function and apply to 3 tables
-- ---------------------------------------------------------------------------
-- messaging_connections, user_memories, and scheduled_tasks all define
-- updated_at TIMESTAMPTZ DEFAULT now() but never auto-update the column
-- on subsequent UPDATEs.

-- Shared trigger function (CREATE OR REPLACE is idempotent)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to messaging_connections
CREATE TRIGGER trg_messaging_connections_updated_at
  BEFORE UPDATE ON public.messaging_connections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Apply to user_memories
CREATE TRIGGER trg_user_memories_updated_at
  BEFORE UPDATE ON public.user_memories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Apply to scheduled_tasks
CREATE TRIGGER trg_scheduled_tasks_updated_at
  BEFORE UPDATE ON public.scheduled_tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ---------------------------------------------------------------------------
-- M11: Add bounds CHECK on conversation_tags.confidence (0.0–1.0)
-- ---------------------------------------------------------------------------
-- The confidence column accepts any REAL value. AI-classified tag confidence
-- must be normalised between 0.0 (no confidence) and 1.0 (full confidence).
ALTER TABLE public.conversation_tags
  ADD CONSTRAINT chk_confidence_bounds
  CHECK (confidence >= 0.0 AND confidence <= 1.0);
