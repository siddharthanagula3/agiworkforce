-- Migration: Add Chat History FTS5 Full-Text Search
-- Version: 20260224000100
-- Date: 2026-02-24
-- Purpose: Backfill existing messages into the messages_fts FTS5 index so that
--          chat history search (search_chat_history Tauri command) returns
--          results for messages written before the FTS triggers were installed.
--
-- This SQL file is the reference specification.  The authoritative runner is
-- apply_migration_v55() in src/data/db/migrations.rs (schema version 55).
--
-- The messages_fts virtual table and its INSERT/UPDATE/DELETE triggers were
-- created by migration v45.  All messages written after v45 are already
-- indexed automatically.  This backfill targets rows that pre-date v45.
--
-- Idempotent: rows already present in messages_fts are skipped via NOT EXISTS.

-- Backfill: insert every message not yet in the FTS index.
-- Column mapping matches the v45 trigger definitions:
--   message_id      <- CAST(messages.id              AS TEXT)
--   conversation_id <- CAST(messages.conversation_id AS TEXT)
--   content         <- messages.content
--   sender          <- messages.role
--   message_type    <- 'text'  (hard-coded, same as the triggers)
--   timestamp       <- messages.created_at
INSERT INTO messages_fts (message_id, conversation_id, content, sender, message_type, timestamp)
SELECT
    CAST(m.id              AS TEXT),
    CAST(m.conversation_id AS TEXT),
    m.content,
    m.role,
    'text',
    m.created_at
FROM messages m
WHERE NOT EXISTS (
    SELECT 1 FROM messages_fts f
    WHERE f.message_id = CAST(m.id AS TEXT)
);
