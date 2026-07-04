-- =============================================================================
-- Migration: 0047_user_memories_pinned.sql
-- Purpose  : Add server-side persistence for the mobile memory pin/unpin
--            feature. `apps/mobile` already sends/reads a `pinned` boolean on
--            /api/memory/sync (see apps/mobile/services/cloudSyncEngine.ts),
--            but `user_memories` has no column to store it, so pin state does
--            not persist cross-device today (mobile carries a client-side
--            fallback in the meantime).
--
-- COORDINATION: ADDITIVE ONLY. Does not touch RLS policies (0037) or the
--            server_version sync trigger (0040) — `pinned` rides the same
--            delta-sync transport as the other user_memories columns.
--
-- Idempotent: safe to re-run (IF NOT EXISTS).
--
-- NOT YET APPLIED — draft only, pending explicit approval before running
-- against the shared Neon database.
-- =============================================================================

ALTER TABLE public.user_memories
  ADD COLUMN IF NOT EXISTS pinned BOOLEAN NOT NULL DEFAULT false;
