-- Wave 5: Scheduled Tasks Backing Tables
-- Description: Two tables supporting event-triggered agent execution:
--   scheduled_tasks     — task definitions (cron, once, interval schedules)
--   scheduled_task_runs — immutable execution log per task run
-- Date: 2026-03-19

-- ============================================================================
-- 1. scheduled_tasks
-- Stores user-defined scheduled task definitions. Each task has a schedule_type
-- ('cron', 'once', 'interval') and an action_type ('agent', 'workflow',
-- 'notification', 'command') that determines how action_config is interpreted
-- at execution time. The scheduler reads rows where is_enabled = true and
-- next_execution_at <= now() to dispatch pending work.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.scheduled_tasks (
    id               uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id          uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name             text        NOT NULL,
    description      text,
    -- Schedule shape --
    schedule_type    text        NOT NULL
                                 CHECK (schedule_type IN ('cron', 'once', 'interval')),
    cron_expression  text,
    execute_at       timestamptz,
    interval_ms      bigint,
    timezone         text        NOT NULL DEFAULT 'UTC',
    is_enabled       boolean     NOT NULL DEFAULT true,
    expires_at       timestamptz,
    max_executions   integer     NOT NULL DEFAULT 0,   -- 0 = unlimited
    execution_count  integer     NOT NULL DEFAULT 0,
    -- Action payload --
    action_type      text        NOT NULL
                                 CHECK (action_type IN ('agent', 'workflow', 'notification', 'command')),
    action_config    jsonb       NOT NULL DEFAULT '{}',
    prompt           text,
    model            text,
    -- Runtime state --
    status           text        NOT NULL DEFAULT 'active'
                                 CHECK (status IN ('active', 'paused', 'completed', 'failed', 'expired')),
    last_executed_at timestamptz,
    next_execution_at timestamptz,
    last_error       text,
    -- Audit --
    metadata         jsonb       DEFAULT '{}',
    created_at       timestamptz DEFAULT now(),
    updated_at       timestamptz DEFAULT now()
);

ALTER TABLE public.scheduled_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own scheduled tasks"
    ON public.scheduled_tasks FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own scheduled tasks"
    ON public.scheduled_tasks FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own scheduled tasks"
    ON public.scheduled_tasks FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own scheduled tasks"
    ON public.scheduled_tasks FOR DELETE
    USING (auth.uid() = user_id);

CREATE POLICY "Service role full access on scheduled_tasks"
    ON public.scheduled_tasks FOR ALL
    USING (auth.role() = 'service_role');

-- Primary lookup: scheduler polls pending tasks for all users
CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_next_execution_at
    ON public.scheduled_tasks(next_execution_at)
    WHERE is_enabled = true;

-- Dashboard listing: user's tasks in creation order
CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_user_id_created_at
    ON public.scheduled_tasks(user_id, created_at DESC);

-- Filter by status for the "active tasks" and "history" views
CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_user_id_status
    ON public.scheduled_tasks(user_id, status);

-- Auto-update updated_at on any mutation
CREATE OR REPLACE FUNCTION public.update_scheduled_tasks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_scheduled_tasks_updated_at ON public.scheduled_tasks;
CREATE TRIGGER trigger_scheduled_tasks_updated_at
    BEFORE UPDATE ON public.scheduled_tasks
    FOR EACH ROW
    EXECUTE FUNCTION public.update_scheduled_tasks_updated_at();

-- ============================================================================
-- 2. scheduled_task_runs
-- Immutable execution log: one row per invocation of a scheduled task.
-- Rows are written by the scheduler (service role) and are read-only for users.
-- No UPDATE/DELETE policies are provided — rows are append-only audit records.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.scheduled_task_runs (
    id             uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
    task_id        uuid        NOT NULL REFERENCES public.scheduled_tasks(id) ON DELETE CASCADE,
    status         text        NOT NULL
                               CHECK (status IN ('running', 'success', 'failed', 'timeout', 'cancelled')),
    trigger_source text        NOT NULL DEFAULT 'schedule'
                               CHECK (trigger_source IN ('schedule', 'manual', 'webhook', 'api')),
    started_at     timestamptz NOT NULL DEFAULT now(),
    completed_at   timestamptz,
    duration_ms    bigint,
    result         jsonb,
    error          text
);

ALTER TABLE public.scheduled_task_runs ENABLE ROW LEVEL SECURITY;

-- Users may read run history for tasks they own
CREATE POLICY "Users can view own task runs"
    ON public.scheduled_task_runs FOR SELECT
    USING (
        EXISTS (
            SELECT 1
            FROM public.scheduled_tasks
            WHERE id = scheduled_task_runs.task_id
              AND user_id = auth.uid()
        )
    );

-- Users may insert manual trigger runs against their own tasks
CREATE POLICY "Users can insert own task runs"
    ON public.scheduled_task_runs FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.scheduled_tasks
            WHERE id = scheduled_task_runs.task_id
              AND user_id = auth.uid()
        )
    );

CREATE POLICY "Service role full access on scheduled_task_runs"
    ON public.scheduled_task_runs FOR ALL
    USING (auth.role() = 'service_role');

-- Primary query: all runs for a given task in reverse chronological order
CREATE INDEX IF NOT EXISTS idx_scheduled_task_runs_task_id_started_at
    ON public.scheduled_task_runs(task_id, started_at DESC);

-- Scheduler uses this to detect runs that have been stuck in 'running' too long
CREATE INDEX IF NOT EXISTS idx_scheduled_task_runs_status_started_at
    ON public.scheduled_task_runs(status, started_at)
    WHERE status = 'running';

-- Enable Realtime so the mobile companion can stream run status updates live
ALTER PUBLICATION supabase_realtime ADD TABLE public.scheduled_tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.scheduled_task_runs;
