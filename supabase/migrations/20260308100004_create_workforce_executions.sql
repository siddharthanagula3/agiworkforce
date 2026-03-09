-- Migration: Create workforce_executions table
-- Description: Workforce execution history
-- Date: 2026-03-08

CREATE TABLE IF NOT EXISTS public.workforce_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES public.workforce_tasks(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    employee_id TEXT NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed', 'cancelled')),
    duration_ms BIGINT,
    tokens_used INT DEFAULT 0,
    cost_estimate NUMERIC(10,6) DEFAULT 0,
    result JSONB,
    error TEXT,
    -- updated_at tracks last status change (running -> completed/failed/cancelled)
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_workforce_executions_task_id ON public.workforce_executions(task_id);
CREATE INDEX IF NOT EXISTS idx_workforce_executions_user_id ON public.workforce_executions(user_id);
CREATE INDEX IF NOT EXISTS idx_workforce_executions_employee_id ON public.workforce_executions(employee_id);
CREATE INDEX IF NOT EXISTS idx_workforce_executions_status ON public.workforce_executions(status);
CREATE INDEX IF NOT EXISTS idx_workforce_executions_started_at ON public.workforce_executions(started_at DESC);

-- RLS
ALTER TABLE public.workforce_executions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own workforce executions"
    ON public.workforce_executions FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own workforce executions"
    ON public.workforce_executions FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own workforce executions"
    ON public.workforce_executions FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own workforce executions"
    ON public.workforce_executions FOR DELETE
    USING (auth.uid() = user_id);

CREATE POLICY "Service role has full access to workforce executions"
    ON public.workforce_executions FOR ALL
    USING (auth.role() = 'service_role');

-- Auto-update updated_at on status changes
CREATE OR REPLACE FUNCTION public.update_workforce_execution_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_workforce_executions_updated_at ON public.workforce_executions;
CREATE TRIGGER trigger_workforce_executions_updated_at
    BEFORE UPDATE ON public.workforce_executions
    FOR EACH ROW
    EXECUTE FUNCTION public.update_workforce_execution_updated_at();
