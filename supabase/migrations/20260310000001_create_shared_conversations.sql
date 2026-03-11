-- Migration: create_shared_conversations
-- Creates the table that stores publicly-shared conversation snapshots.
-- Each row is keyed by a UUID token and expires after 30 days.

CREATE TABLE IF NOT EXISTS shared_conversations (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  token       text UNIQUE NOT NULL,
  messages_json text NOT NULL,
  title       text NOT NULL DEFAULT 'Shared Conversation',
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL
);

-- Fast lookup by token (used on every share-page load).
CREATE INDEX IF NOT EXISTS idx_shared_conversations_token
  ON shared_conversations (token);

-- Allows an efficient cron job to delete expired rows without a full-table scan.
CREATE INDEX IF NOT EXISTS idx_shared_conversations_expires
  ON shared_conversations (expires_at);

-- Row-Level Security: this table is accessed exclusively via the service-role key
-- from the API route, so public access is disabled.
ALTER TABLE shared_conversations ENABLE ROW LEVEL SECURITY;

-- No RLS policy for authenticated users — all access goes through the
-- service-role key in the /api/shared route.  Public SELECT is intentionally
-- withheld because the API handler enforces expiry before returning data.
