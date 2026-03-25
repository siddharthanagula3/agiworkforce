-- Dispatch Cloud-Sync Tables (Phase 1)
-- Description: Three tables supporting the mobile Dispatch feature —
--   a persistent chat thread between mobile and desktop where the user
--   issues natural-language tasks from the phone and the desktop agent
--   executes them.
--
--   dispatch_threads      — one per user, persistent singleton thread
--   dispatch_messages     — messages in the dispatch thread
--   dispatch_agent_state  — desktop publishes live agent + approval state
--
-- Access model: all tables are user-scoped — rows belonging to a user are
-- only accessible by that user via RLS policies.
-- Date: 2026-03-24

-- ============================================================================
-- Shared trigger function for updated_at columns
-- Reusable across all three tables. Created with CREATE OR REPLACE so it is
-- safe to run even if a prior migration already defined a similar function.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_dispatch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 1. dispatch_threads
-- One persistent dispatch thread per user. The mobile companion always shows
-- the same thread — there is no thread list. If the user deletes their
-- account the thread (and cascading messages) are removed automatically.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.dispatch_threads (
    id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title       text        DEFAULT 'Dispatch',
    created_at  timestamptz DEFAULT now(),
    updated_at  timestamptz DEFAULT now(),
    UNIQUE(user_id)
);

ALTER TABLE public.dispatch_threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own dispatch threads"
    ON public.dispatch_threads FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own dispatch threads"
    ON public.dispatch_threads FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own dispatch threads"
    ON public.dispatch_threads FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own dispatch threads"
    ON public.dispatch_threads FOR DELETE
    USING (auth.uid() = user_id);

CREATE POLICY "Service role full access on dispatch_threads"
    ON public.dispatch_threads FOR ALL
    USING (auth.role() = 'service_role');

-- Auto-update updated_at
DROP TRIGGER IF EXISTS trigger_dispatch_threads_updated_at ON public.dispatch_threads;
CREATE TRIGGER trigger_dispatch_threads_updated_at
    BEFORE UPDATE ON public.dispatch_threads
    FOR EACH ROW
    EXECUTE FUNCTION public.update_dispatch_updated_at();

-- ============================================================================
-- 2. dispatch_messages
-- Messages within a dispatch thread. Each message records the originating
-- surface (mobile or desktop) so the UI can visually distinguish user-sent
-- commands from desktop agent responses.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.dispatch_messages (
    id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
    thread_id       uuid        NOT NULL REFERENCES public.dispatch_threads(id) ON DELETE CASCADE,
    user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role            text        NOT NULL
                                CHECK (role IN ('user', 'assistant')),
    content         text        NOT NULL DEFAULT '',
    surface         text        NOT NULL
                                CHECK (surface IN ('mobile', 'desktop')),
    task_status     text        CHECK (task_status IN ('pending', 'working', 'completed', 'failed')),
    status_detail   text,
    task_result     jsonb,
    metadata        jsonb,      -- for agent commands, approvals, etc.
    created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.dispatch_messages ENABLE ROW LEVEL SECURITY;

-- Users can read messages in dispatch threads they own
CREATE POLICY "Users can view own dispatch messages"
    ON public.dispatch_messages FOR SELECT
    USING (
        EXISTS (
            SELECT 1
            FROM public.dispatch_threads
            WHERE id = dispatch_messages.thread_id
              AND user_id = auth.uid()
        )
    );

-- Users can write messages to dispatch threads they own
CREATE POLICY "Users can insert own dispatch messages"
    ON public.dispatch_messages FOR INSERT
    WITH CHECK (
        auth.uid() = user_id
        AND EXISTS (
            SELECT 1
            FROM public.dispatch_threads
            WHERE id = dispatch_messages.thread_id
              AND user_id = auth.uid()
        )
    );

-- Users can update their own dispatch messages (e.g., status transitions)
CREATE POLICY "Users can update own dispatch messages"
    ON public.dispatch_messages FOR UPDATE
    USING (
        auth.uid() = user_id
        AND EXISTS (
            SELECT 1
            FROM public.dispatch_threads
            WHERE id = dispatch_messages.thread_id
              AND user_id = auth.uid()
        )
    )
    WITH CHECK (
        auth.uid() = user_id
        AND EXISTS (
            SELECT 1
            FROM public.dispatch_threads
            WHERE id = dispatch_messages.thread_id
              AND user_id = auth.uid()
        )
    );

-- Users can delete their own dispatch messages
CREATE POLICY "Users can delete own dispatch messages"
    ON public.dispatch_messages FOR DELETE
    USING (
        auth.uid() = user_id
        AND EXISTS (
            SELECT 1
            FROM public.dispatch_threads
            WHERE id = dispatch_messages.thread_id
              AND user_id = auth.uid()
        )
    );

CREATE POLICY "Service role full access on dispatch_messages"
    ON public.dispatch_messages FOR ALL
    USING (auth.role() = 'service_role');

-- Primary message list query: all messages in a thread in creation order
CREATE INDEX IF NOT EXISTS idx_dispatch_messages_thread_id_created_at
    ON public.dispatch_messages(thread_id, created_at ASC);

-- ============================================================================
-- 3. dispatch_agent_state
-- Desktop publishes its current agent state and pending approvals here so
-- that the mobile companion can display a live dashboard even when the
-- WebRTC/signaling channel is down. One row per user (upserted by desktop).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.dispatch_agent_state (
    id                  uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id             uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    agents              jsonb       NOT NULL DEFAULT '[]',
    pending_approvals   jsonb       NOT NULL DEFAULT '[]',
    updated_at          timestamptz DEFAULT now(),
    UNIQUE(user_id)
);

ALTER TABLE public.dispatch_agent_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own dispatch agent state"
    ON public.dispatch_agent_state FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own dispatch agent state"
    ON public.dispatch_agent_state FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own dispatch agent state"
    ON public.dispatch_agent_state FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own dispatch agent state"
    ON public.dispatch_agent_state FOR DELETE
    USING (auth.uid() = user_id);

CREATE POLICY "Service role full access on dispatch_agent_state"
    ON public.dispatch_agent_state FOR ALL
    USING (auth.role() = 'service_role');

-- Auto-update updated_at
DROP TRIGGER IF EXISTS trigger_dispatch_agent_state_updated_at ON public.dispatch_agent_state;
CREATE TRIGGER trigger_dispatch_agent_state_updated_at
    BEFORE UPDATE ON public.dispatch_agent_state
    FOR EACH ROW
    EXECUTE FUNCTION public.update_dispatch_updated_at();

-- ============================================================================
-- Enable Supabase Realtime for all dispatch tables
-- ============================================================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.dispatch_threads;
ALTER PUBLICATION supabase_realtime ADD TABLE public.dispatch_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.dispatch_agent_state;
