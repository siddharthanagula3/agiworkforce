-- Migration 0023: add revoked_at column to api_keys
-- The api_keys table was created in 0005_api_keys.sql.
-- This migration extends it with a soft-delete revoked_at timestamp
-- so individual keys can be revoked without deletion, preserving audit trails.

alter table public.api_keys
  add column if not exists revoked_at timestamptz;

create index if not exists idx_api_keys_revoked_at
  on public.api_keys(user_id, revoked_at)
  where revoked_at is null;
