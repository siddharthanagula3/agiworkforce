-- 0101 — Scope the cloud-sync delta indexes to the owning row where the table
--        has an owner column, and make history search index-backed instead of
--        a sequential scan.
--
-- (1) Delta pull. `cloud_sync_version_seq` (0038) is global on purpose: one
--     cursor spans conversations, messages, artifacts, projects and settings,
--     so a client that has seen version N has seen every table up to N. The
--     price is that a single user's versions are scattered across the whole
--     sequence — and 0038–0042 indexed `server_version` alone, so
--     `WHERE user_id = $1 AND server_version > $2 ORDER BY server_version`
--     had to walk every other user's rows above the cursor and throw them away.
--     For the four tables that carry user_id, leading with the owner turns that
--     into one contiguous range per user, in the ORDER BY's own order, which is
--     exactly the shape /api/chat/sync, /api/projects/sync and /api/memory/sync
--     ask for.
--
--     web_messages is deliberately NOT changed here — see section 2.
--
-- (2) History search. /api/search and /api/memory/search match
--     `content ILIKE '%q%'`, plus titles, names and filenames elsewhere. A
--     leading wildcard cannot use a btree index at all, so every search
--     sequentially scanned the table; trigram GIN indexes are the only
--     structure that serves it. They cost write throughput on web_messages — a
--     GIN entry per trigram of every message body — which is the accepted trade
--     for search that does not degrade with history size.
--
-- Idempotent: safe to re-run (IF NOT EXISTS / IF EXISTS throughout).
--
-- Apply on a Neon branch first, then production via the Neon workflow: the
-- index builds below take a write lock on their table for their duration, and
-- nothing in `pnpm check:neon-migrations` / `pnpm test:db-migrate` executes this
-- SQL against a server — those check inventory contiguity and checksums only.

-- 1. Owner-scoped delta indexes for the tables that have an owner column.
CREATE INDEX IF NOT EXISTS idx_web_conversations_user_server_version
  ON public.web_conversations(user_id, server_version);

CREATE INDEX IF NOT EXISTS idx_web_artifacts_user_server_version
  ON public.web_artifacts(user_id, server_version);

CREATE INDEX IF NOT EXISTS idx_user_projects_user_server_version
  ON public.user_projects(user_id, server_version);

CREATE INDEX IF NOT EXISTS idx_user_memories_user_server_version
  ON public.user_memories(user_id, server_version);

-- 2. Drop the superseded single-column indexes — but only where the composite
--    above genuinely supersedes them. Each of these four pulls is
--    `WHERE user_id = $1 AND server_version > $2 ORDER BY server_version ASC
--    LIMIT n`: equality on the leading column, range plus ordering on the
--    second, so the composite serves it without a Sort and the single-column
--    index can never be the cheaper path, while still being maintained on every
--    write (the 0038 trigger re-assigns server_version on UPDATE, so each one is
--    rewritten on every edit).
--
--    idx_web_messages_server_version is NOT dropped. web_messages has no
--    user_id; its pull (apps/web/app/api/chat/sync/route.ts) is
--    `... from web_messages m join web_conversations c on c.id = m.conversation_id
--    where c.user_id = $1 and m.server_version > $2 order by m.server_version asc
--    limit 1000` — there is no equality on conversation_id, so an index leading
--    with conversation_id cannot produce server_version order and forces a full
--    Sort with no early termination. The single-column index is the only
--    sort-free, early-terminating path this query has, and it is the highest
--    frequency query on the platform. Closing the cross-tenant scan for messages
--    needs user_id denormalized onto web_messages plus a backfill, which is a
--    schema change, not an index migration; tracked as a gap rather than traded
--    for a regression here.
--
--    user_settings gets no replacement: user_id is its primary key, so its pull
--    is a single-row lookup and the version index only ever cost writes.
DROP INDEX IF EXISTS public.idx_web_conversations_server_version;
DROP INDEX IF EXISTS public.idx_web_artifacts_server_version;
DROP INDEX IF EXISTS public.idx_user_projects_server_version;
DROP INDEX IF EXISTS public.idx_user_memories_server_version;
DROP INDEX IF EXISTS public.idx_user_settings_server_version;

-- 3. Trigram indexes for the `ILIKE '%q%'` predicates in /api/search,
--    /api/memory/search and /api/chat/conversations. pg_trgm serves a
--    leading-wildcard LIKE/ILIKE only when the pattern holds at least three
--    non-wildcard characters; shorter queries still fall back to a scan, which
--    stays affordable only because the caller is rate limited.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_web_messages_content_trgm
  ON public.web_messages USING gin (content gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_web_conversations_title_trgm
  ON public.web_conversations USING gin (title gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_user_projects_name_trgm
  ON public.user_projects USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_user_projects_description_trgm
  ON public.user_projects USING gin (description gin_trgm_ops);

-- user_memories.content runs the same leading-wildcard predicate in
-- apps/web/app/api/memory/search/route.ts (`content ilike $2`).
CREATE INDEX IF NOT EXISTS idx_user_memories_content_trgm
  ON public.user_memories USING gin (content gin_trgm_ops);

-- The library predicates are expressions, so the indexes must match them
-- character for character to be usable — see the `files` query in
-- apps/web/app/api/search/route.ts.
CREATE INDEX IF NOT EXISTS idx_media_assets_filename_trgm
  ON public.media_assets USING gin ((coalesce(metadata->>'filename','')) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_media_assets_prompt_trgm
  ON public.media_assets USING gin ((coalesce(prompt,'')) gin_trgm_ops);
