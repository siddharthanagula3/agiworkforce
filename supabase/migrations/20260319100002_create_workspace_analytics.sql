-- Wave 5: Workspace Analytics Backing Tables
-- Description: Three tables for workspace/enterprise usage analytics:
--   workspace_analytics_events — raw event stream (user actions, agent executions, tool usage)
--   workspace_analytics_daily  — pre-aggregated daily rollups keyed by workspace + date
--   workspace_usage_quotas     — per-workspace usage limits managed by workspace admins
-- Date: 2026-03-19
--
-- Access model:
--   Events      — workspace members can insert their own; members can read workspace events
--   Daily       — workspace members can read; service role writes via the aggregation job
--   Quotas      — workspace members can read; only admins (owner or admin-role member) can write

-- ============================================================================
-- 1. workspace_analytics_events
-- Append-only raw event stream. Every user action, agent execution, and tool
-- call on any surface emits one row here. The aggregation job (runs nightly)
-- rolls these up into workspace_analytics_daily.
-- Rows are intentionally immutable — no UPDATE/DELETE user policies.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.workspace_analytics_events (
    id             uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
    workspace_id   uuid        NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
    user_id        uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
    -- Classification --
    event_type     text        NOT NULL,   -- e.g. 'agent.started', 'tool.called', 'message.sent'
    surface        text        NOT NULL,   -- 'desktop' | 'web' | 'mobile' | 'cli' | 'vscode' | 'extension'
    -- Context --
    resource_type  text,                  -- e.g. 'agent', 'tool', 'workflow', 'conversation'
    resource_id    text,                  -- arbitrary string ID of the resource
    model          text,                  -- LLM model used (if applicable)
    provider       text,                  -- LLM provider (if applicable)
    -- Metrics --
    duration_ms    bigint,
    token_count    integer,
    cost_usd       numeric(12, 6),
    -- Payload --
    properties     jsonb       DEFAULT '{}',
    -- Audit --
    occurred_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.workspace_analytics_events ENABLE ROW LEVEL SECURITY;

-- Members of a workspace can read that workspace's raw events
CREATE POLICY "Workspace members can view analytics events"
    ON public.workspace_analytics_events FOR SELECT
    USING (
        EXISTS (
            SELECT 1
            FROM public.team_members
            WHERE team_id = workspace_analytics_events.workspace_id
              AND user_id = auth.uid()
        )
        OR
        EXISTS (
            SELECT 1
            FROM public.teams
            WHERE id = workspace_analytics_events.workspace_id
              AND owner_id = auth.uid()
        )
    );

-- Members can insert their own events; the workspace_id must match a workspace they belong to
CREATE POLICY "Workspace members can insert own analytics events"
    ON public.workspace_analytics_events FOR INSERT
    WITH CHECK (
        auth.uid() = user_id
        AND (
            EXISTS (
                SELECT 1
                FROM public.team_members
                WHERE team_id = workspace_analytics_events.workspace_id
                  AND user_id = auth.uid()
            )
            OR
            EXISTS (
                SELECT 1
                FROM public.teams
                WHERE id = workspace_analytics_events.workspace_id
                  AND owner_id = auth.uid()
            )
        )
    );

CREATE POLICY "Service role full access on workspace_analytics_events"
    ON public.workspace_analytics_events FOR ALL
    USING (auth.role() = 'service_role');

-- Time-range dashboard queries: filter by workspace + date window
CREATE INDEX IF NOT EXISTS idx_analytics_events_workspace_occurred_at
    ON public.workspace_analytics_events(workspace_id, occurred_at DESC);

-- Per-user drill-down within a workspace
CREATE INDEX IF NOT EXISTS idx_analytics_events_workspace_user_id
    ON public.workspace_analytics_events(workspace_id, user_id);

-- Filter by event_type (e.g., show only agent executions)
CREATE INDEX IF NOT EXISTS idx_analytics_events_workspace_event_type
    ON public.workspace_analytics_events(workspace_id, event_type);

-- ============================================================================
-- 2. workspace_analytics_daily
-- Pre-aggregated daily metrics per workspace. Written exclusively by the
-- server-side aggregation job (service role). Workspace members can read.
-- One row per (workspace_id, metric_date) — upserted by the nightly job.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.workspace_analytics_daily (
    id                    uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
    workspace_id          uuid        NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
    metric_date           date        NOT NULL,
    -- Usage totals --
    active_users          integer     NOT NULL DEFAULT 0,
    total_messages        integer     NOT NULL DEFAULT 0,
    total_agent_runs      integer     NOT NULL DEFAULT 0,
    total_tool_calls      integer     NOT NULL DEFAULT 0,
    total_tokens          bigint      NOT NULL DEFAULT 0,
    total_cost_usd        numeric(14, 6) NOT NULL DEFAULT 0,
    -- Per-surface breakdown (jsonb for flexibility) --
    surface_breakdown     jsonb       DEFAULT '{}',
    -- Per-model breakdown --
    model_breakdown       jsonb       DEFAULT '{}',
    -- Per-user breakdown (top-N users by message count) --
    user_breakdown        jsonb       DEFAULT '{}',
    -- Audit --
    computed_at           timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT workspace_analytics_daily_workspace_date_unique
        UNIQUE (workspace_id, metric_date)
);

ALTER TABLE public.workspace_analytics_daily ENABLE ROW LEVEL SECURITY;

-- Workspace members can read aggregated metrics
CREATE POLICY "Workspace members can view daily analytics"
    ON public.workspace_analytics_daily FOR SELECT
    USING (
        EXISTS (
            SELECT 1
            FROM public.team_members
            WHERE team_id = workspace_analytics_daily.workspace_id
              AND user_id = auth.uid()
        )
        OR
        EXISTS (
            SELECT 1
            FROM public.teams
            WHERE id = workspace_analytics_daily.workspace_id
              AND owner_id = auth.uid()
        )
    );

-- Only service role may write (aggregation job runs with the service key)
CREATE POLICY "Service role full access on workspace_analytics_daily"
    ON public.workspace_analytics_daily FOR ALL
    USING (auth.role() = 'service_role');

-- Date-range chart queries: ordered by date for the analytics dashboard
CREATE INDEX IF NOT EXISTS idx_analytics_daily_workspace_metric_date
    ON public.workspace_analytics_daily(workspace_id, metric_date DESC);

-- ============================================================================
-- 3. workspace_usage_quotas
-- Usage limits enforced per workspace. One row per workspace; workspace admins
-- and owners can read and update limits. Members can read so the UI can show
-- quota headroom. The enforcement check runs server-side via the service role.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.workspace_usage_quotas (
    id                    uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
    workspace_id          uuid        NOT NULL UNIQUE REFERENCES public.teams(id) ON DELETE CASCADE,
    -- Hard limits (0 = unlimited) --
    max_monthly_tokens    bigint      NOT NULL DEFAULT 0,
    max_monthly_cost_usd  numeric(12, 2) NOT NULL DEFAULT 0,
    max_agent_runs_daily  integer     NOT NULL DEFAULT 0,
    max_members           integer     NOT NULL DEFAULT 0,
    -- Current period usage (reset on the 1st of each month by service job) --
    current_tokens        bigint      NOT NULL DEFAULT 0,
    current_cost_usd      numeric(12, 2) NOT NULL DEFAULT 0,
    current_agent_runs    integer     NOT NULL DEFAULT 0,
    period_start          date        NOT NULL DEFAULT date_trunc('month', now())::date,
    -- Alert thresholds (percentage of limit, 0 = alerts disabled) --
    alert_threshold_pct   integer     NOT NULL DEFAULT 80
                                      CHECK (alert_threshold_pct BETWEEN 0 AND 100),
    -- Audit --
    metadata              jsonb       DEFAULT '{}',
    created_at            timestamptz DEFAULT now(),
    updated_at            timestamptz DEFAULT now()
);

ALTER TABLE public.workspace_usage_quotas ENABLE ROW LEVEL SECURITY;

-- All workspace members can read quota/headroom (shown in the UI billing section)
CREATE POLICY "Workspace members can view usage quotas"
    ON public.workspace_usage_quotas FOR SELECT
    USING (
        EXISTS (
            SELECT 1
            FROM public.team_members
            WHERE team_id = workspace_usage_quotas.workspace_id
              AND user_id = auth.uid()
        )
        OR
        EXISTS (
            SELECT 1
            FROM public.teams
            WHERE id = workspace_usage_quotas.workspace_id
              AND owner_id = auth.uid()
        )
    );

-- Only workspace owner or admin-role members may insert quota rows
CREATE POLICY "Workspace admins can insert usage quotas"
    ON public.workspace_usage_quotas FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.teams
            WHERE id = workspace_usage_quotas.workspace_id
              AND owner_id = auth.uid()
        )
        OR
        EXISTS (
            SELECT 1
            FROM public.team_members
            WHERE team_id = workspace_usage_quotas.workspace_id
              AND user_id = auth.uid()
              AND role = 'admin'
        )
    );

-- Only workspace owner or admin-role members may update limits
CREATE POLICY "Workspace admins can update usage quotas"
    ON public.workspace_usage_quotas FOR UPDATE
    USING (
        EXISTS (
            SELECT 1
            FROM public.teams
            WHERE id = workspace_usage_quotas.workspace_id
              AND owner_id = auth.uid()
        )
        OR
        EXISTS (
            SELECT 1
            FROM public.team_members
            WHERE team_id = workspace_usage_quotas.workspace_id
              AND user_id = auth.uid()
              AND role = 'admin'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.teams
            WHERE id = workspace_usage_quotas.workspace_id
              AND owner_id = auth.uid()
        )
        OR
        EXISTS (
            SELECT 1
            FROM public.team_members
            WHERE team_id = workspace_usage_quotas.workspace_id
              AND user_id = auth.uid()
              AND role = 'admin'
        )
    );

-- Only workspace owner or admin-role members may delete a quota row
CREATE POLICY "Workspace admins can delete usage quotas"
    ON public.workspace_usage_quotas FOR DELETE
    USING (
        EXISTS (
            SELECT 1
            FROM public.teams
            WHERE id = workspace_usage_quotas.workspace_id
              AND owner_id = auth.uid()
        )
        OR
        EXISTS (
            SELECT 1
            FROM public.team_members
            WHERE team_id = workspace_usage_quotas.workspace_id
              AND user_id = auth.uid()
              AND role = 'admin'
        )
    );

CREATE POLICY "Service role full access on workspace_usage_quotas"
    ON public.workspace_usage_quotas FOR ALL
    USING (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_workspace_usage_quotas_workspace_id
    ON public.workspace_usage_quotas(workspace_id);

-- Auto-update updated_at on quota changes
CREATE OR REPLACE FUNCTION public.update_workspace_usage_quotas_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_workspace_usage_quotas_updated_at ON public.workspace_usage_quotas;
CREATE TRIGGER trigger_workspace_usage_quotas_updated_at
    BEFORE UPDATE ON public.workspace_usage_quotas
    FOR EACH ROW
    EXECUTE FUNCTION public.update_workspace_usage_quotas_updated_at();
