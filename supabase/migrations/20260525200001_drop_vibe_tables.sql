-- Drop legacy vibe tables from pre-AGI project.
-- These tables are unused — the single INSERT in log-message/route.ts
-- is being removed in this same changeset.

DROP TABLE IF EXISTS public.vibe_agent_messages CASCADE;
DROP TABLE IF EXISTS public.vibe_agent_actions CASCADE;
DROP TABLE IF EXISTS public.vibe_messages CASCADE;
DROP TABLE IF EXISTS public.vibe_sessions CASCADE;

DROP FUNCTION IF EXISTS public.update_vibe_session_updated_at() CASCADE;
DROP FUNCTION IF EXISTS public.update_vibe_session_on_message() CASCADE;
