-- Add project_id to web_conversations
ALTER TABLE IF EXISTS public.web_conversations
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.user_projects(id) ON DELETE SET NULL;

-- Index for project-scoped conversation queries
CREATE INDEX IF NOT EXISTS idx_web_conversations_project_id
  ON public.web_conversations(project_id)
  WHERE project_id IS NOT NULL AND deleted_at IS NULL;
