-- ============================================================================
-- Migration: Add scheduled_tasks and schedule_runs tables
-- Phase 11: Mobile Scheduling feature
-- ============================================================================

-- Scheduled tasks table
CREATE TABLE IF NOT EXISTS public.scheduled_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  prompt TEXT NOT NULL,
  model TEXT NOT NULL DEFAULT 'auto-balanced',
  recurrence TEXT NOT NULL DEFAULT 'once' CHECK (recurrence IN ('once', 'daily', 'weekly', 'monthly', 'custom')),
  cron_expression TEXT,
  scheduled_at TIMESTAMPTZ,
  days_of_week INTEGER[],
  day_of_month INTEGER,
  time_of_day TEXT NOT NULL DEFAULT '09:00',
  timezone TEXT NOT NULL DEFAULT 'UTC',
  is_active BOOLEAN DEFAULT TRUE,
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  last_run_status TEXT CHECK (last_run_status IN ('success', 'failed', 'pending')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.scheduled_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own scheduled tasks"
  ON public.scheduled_tasks
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_scheduled_tasks_user ON public.scheduled_tasks(user_id, is_active, next_run_at);

-- Schedule runs table
CREATE TABLE IF NOT EXISTS public.schedule_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id UUID REFERENCES public.scheduled_tasks(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('success', 'failed', 'running', 'pending')),
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  result TEXT,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.schedule_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own schedule runs"
  ON public.schedule_runs
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_schedule_runs_schedule ON public.schedule_runs(schedule_id, started_at DESC);
