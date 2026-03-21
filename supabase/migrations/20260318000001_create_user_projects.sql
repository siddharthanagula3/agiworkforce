-- W1.3: User projects for workspace-scoped conversations and custom instructions

CREATE TABLE IF NOT EXISTS public.user_projects (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text DEFAULT '',
  instructions text DEFAULT '',
  color text DEFAULT '#3b82f6',
  is_archived boolean DEFAULT false,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.user_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can CRUD own projects" ON public.user_projects
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Service role full access on user_projects" ON public.user_projects
  FOR ALL USING (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_user_projects_user_id ON public.user_projects(user_id);
CREATE INDEX IF NOT EXISTS idx_user_projects_updated_at ON public.user_projects(updated_at DESC);

-- NOTE: The project_id column on web_conversations is added by the web app's
-- own migration (apps/web/supabase/migrations/20260318200000_conversations_project_id.sql).
-- The ALTER was removed from here because web_conversations is not created in
-- this migration set (root supabase/migrations/) — only in the web app's set.

-- Auto-update updated_at trigger
CREATE OR REPLACE FUNCTION public.update_user_projects_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_user_projects_updated_at ON public.user_projects;
CREATE TRIGGER trigger_user_projects_updated_at
    BEFORE UPDATE ON public.user_projects
    FOR EACH ROW
    EXECUTE FUNCTION public.update_user_projects_updated_at();
