-- Down for 0115 — discovery-based OAuth for MCP connectors.
--
-- Dropping `mcp_oauth_clients` destroys dynamic client registrations that were
-- issued by third-party authorization servers and cannot be re-derived from
-- anything in this repository. Re-applying 0115 gives back the schema, not the
-- registrations: the next connect simply registers again. That is safe (a stale
-- registration at the vendor is orphaned, not dangerous) but it is a real
-- side effect, not a no-op.
--
-- The added columns are dropped rather than left in place so that re-running the
-- up migration is idempotent from either direction.
--
-- NOTE (added when 0115 was applied to production on 2026-08-14): this file was
-- missing the transaction wrapper and the ledger retraction that
-- scripts/check-neon-migrations.mjs requires of every reversal. Without them a
-- failed reversal leaves a half-dropped schema, and `db:migrate apply` still
-- believes 0115 ran so it would never put the schema back. Both are added
-- below; nothing else about the reversal changed.

BEGIN;

drop index if exists public.connector_oauth_grants_issuer_idx;

alter table public.connector_oauth_authorizations
  drop column if exists client_id,
  drop column if exists mcp_url,
  drop column if exists resource_url,
  drop column if exists authorization_endpoint,
  drop column if exists token_endpoint,
  drop column if exists issuer;

alter table public.connector_oauth_grants
  drop column if exists mcp_url,
  drop column if exists resource_url,
  drop column if exists issuer;

drop table if exists public.mcp_oauth_clients;

delete from public.schema_migrations where filename = '0115_mcp_oauth_discovery.sql';

COMMIT;
