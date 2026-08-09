-- Reverses 0101_sync_and_search_indexes.sql — back to the single-column delta
-- indexes of 0038–0042, with no trigram search indexes.
--
-- Recreating the five single-column indexes comes FIRST: between dropping the
-- composite and building its predecessor, every delta pull falls back to a
-- sequential scan of the whole table, and doing it in this order keeps that
-- window at zero. All of it is one transaction, so a failure part-way leaves
-- the indexes exactly as they are now.
--
-- COST OF THE ROLLBACK: search goes back to `content ILIKE '%q%'` over a
-- sequential scan, which is what /api/search and /api/memory/search did before
-- 0101. That is slow, not wrong.
--
-- pg_trgm stays installed. Dropping the extension would fail on any other
-- object that came to depend on it, and an installed extension with no index
-- using it costs nothing — this file removes what 0101 built, not what it
-- enabled.

begin;

-- 1. The 0038–0042 delta indexes, restored before their replacements go.
CREATE INDEX IF NOT EXISTS idx_web_conversations_server_version
  ON public.web_conversations(server_version);

CREATE INDEX IF NOT EXISTS idx_web_artifacts_server_version
  ON public.web_artifacts(server_version);

CREATE INDEX IF NOT EXISTS idx_user_projects_server_version
  ON public.user_projects(server_version);

CREATE INDEX IF NOT EXISTS idx_user_memories_server_version
  ON public.user_memories(server_version);

CREATE INDEX IF NOT EXISTS idx_user_settings_server_version
  ON public.user_settings(server_version);

-- 2. The owner-scoped composites 0101 introduced.
DROP INDEX IF EXISTS public.idx_web_conversations_user_server_version;
DROP INDEX IF EXISTS public.idx_web_artifacts_user_server_version;
DROP INDEX IF EXISTS public.idx_user_projects_user_server_version;
DROP INDEX IF EXISTS public.idx_user_memories_user_server_version;

-- 3. The trigram indexes.
DROP INDEX IF EXISTS public.idx_web_messages_content_trgm;
DROP INDEX IF EXISTS public.idx_web_conversations_title_trgm;
DROP INDEX IF EXISTS public.idx_user_projects_name_trgm;
DROP INDEX IF EXISTS public.idx_user_projects_description_trgm;
DROP INDEX IF EXISTS public.idx_user_memories_content_trgm;
DROP INDEX IF EXISTS public.idx_media_assets_filename_trgm;
DROP INDEX IF EXISTS public.idx_media_assets_prompt_trgm;

delete from public.schema_migrations where filename = '0101_sync_and_search_indexes.sql';

commit;
