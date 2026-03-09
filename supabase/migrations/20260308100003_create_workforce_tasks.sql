-- Migration: Create workforce_tasks table
-- Description: Workforce orchestration task tracking
-- Date: 2026-03-08

CREATE TABLE IF NOT EXISTS public.workforce_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    employee_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
    priority INT DEFAULT 0,
    input_data JSONB DEFAULT '{}',
    output_data JSONB,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    completed_at TIMESTAMPTZ,
    error TEXT
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_workforce_tasks_user_id ON public.workforce_tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_workforce_tasks_employee_id ON public.workforce_tasks(employee_id);
CREATE INDEX IF NOT EXISTS idx_workforce_tasks_status ON public.workforce_tasks(status);
CREATE INDEX IF NOT EXISTS idx_workforce_tasks_created_at ON public.workforce_tasks(created_at DESC);

-- RLS
ALTER TABLE public.workforce_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own workforce tasks"
    ON public.workforce_tasks FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own workforce tasks"
    ON public.workforce_tasks FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own workforce tasks"
    ON public.workforce_tasks FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own workforce tasks"
    ON public.workforce_tasks FOR DELETE
    USING (auth.uid() = user_id);

CREATE POLICY "Service role has full access to workforce tasks"
    ON public.workforce_tasks FOR ALL
    USING (auth.role() = 'service_role');

-- Auto-update updated_at trigger
CREATE OR REPLACE FUNCTION public.update_workforce_task_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger before re-creating for idempotency (PostgreSQL has no CREATE TRIGGER IF NOT EXISTS)
DROP TRIGGER IF EXISTS trigger_workforce_tasks_updated_at ON public.workforce_tasks;
CREATE TRIGGER trigger_workforce_tasks_updated_at
    BEFORE UPDATE ON public.workforce_tasks
    FOR EACH ROW
    EXECUTE FUNCTION public.update_workforce_task_updated_at();
