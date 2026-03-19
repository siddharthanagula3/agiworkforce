-- User Projects table
-- Supports claude.ai-style Projects: each project has a name, description,
-- custom instructions (prepended to every chat), a color label, and optional
-- JSONB metadata for future extensibility.

CREATE TABLE IF NOT EXISTS public.user_projects (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  description TEXT        NOT NULL DEFAULT '' CHECK (char_length(description) <= 2000),
  instructions TEXT       NOT NULL DEFAULT '' CHECK (char_length(instructions) <= 10000),
  color       TEXT        NOT NULL DEFAULT '#3b82f6',
  is_archived BOOLEAN     NOT NULL DEFAULT false,
  metadata    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Fast lookup of all non-archived projects for a given user (most-common query)
CREATE INDEX IF NOT EXISTS idx_user_projects_user_id
  ON public.user_projects (user_id, updated_at DESC)
  WHERE NOT is_archived;

-- Row-Level Security
ALTER TABLE public.user_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_select_own_projects"
  ON public.user_projects
  FOR SELECT
  USING (auth.uid() = user_id AND NOT is_archived);

CREATE POLICY "users_insert_own_projects"
  ON public.user_projects
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users_update_own_projects"
  ON public.user_projects
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "users_delete_own_projects"
  ON public.user_projects
  FOR DELETE
  USING (auth.uid() = user_id);

-- Automatically bump updated_at on every row update
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Guard against duplicate trigger if migration is re-run
DROP TRIGGER IF EXISTS update_user_projects_updated_at ON public.user_projects;

CREATE TRIGGER update_user_projects_updated_at
  BEFORE UPDATE ON public.user_projects
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
