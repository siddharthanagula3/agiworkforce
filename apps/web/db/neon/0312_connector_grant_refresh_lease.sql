-- =============================================================================
-- Migration 0312: a refresh lease on every connector OAuth grant
--
-- Why    : a rotating refresh token is valid for exactly one refresh. Two
--          instances refreshing the same grant at once both present it; the
--          authorization server honours one and rejects the other, and many
--          treat the second presentation as token theft and revoke the whole
--          grant. The lease makes the refresh single-flight per grant across
--          instances: the holder refreshes and writes the rotated token, and
--          every other caller waits for that write and reuses it.
--
-- Empty  : existing grants carry no lease, which reads as free.
--
-- Depends: 0097 (connector_oauth_grants), 0253 (account_key)
-- =============================================================================

begin;

alter table public.connector_oauth_grants
  add column if not exists refresh_lease_id uuid,
  add column if not exists refresh_lease_expires_at timestamptz;

commit;
