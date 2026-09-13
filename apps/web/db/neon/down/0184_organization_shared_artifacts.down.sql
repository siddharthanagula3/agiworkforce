-- Reversal of 0184 : drop organization sharing for published artifacts.
--
-- WHAT THIS COSTS: every workspace-only share. Dropping the grant table
-- destroys the record of which artifacts were shared into which organization,
-- and it cannot be reconstructed from the artifact rows. Re-applying 0184
-- gives back an empty shared set, so each owner must share again.
--
-- WHAT IT EXPOSES: dropping `visibility` returns every row to the 0095 rule
-- that knowledge of the token is the read grant. An artifact that was
-- workspace-only becomes readable by anyone holding its token again. If that
-- matters for a given row, revoke the publication first
-- (DELETE /api/artifacts/publish/<token>) and roll back afterwards.
--
-- ROLLBACK ORDER: application code first. A deploy still running 0184's
-- service reads `visibility` in its SELECT list and its anonymous read
-- predicate, so it fails with 42703 the moment the column is gone.

begin;

drop policy if exists published_artifacts_org_shared_read on public.published_artifacts;

drop table if exists public.organization_shared_artifacts;

alter table public.published_artifacts
  drop constraint if exists published_artifacts_visibility_check;

alter table public.published_artifacts
  drop column if exists visibility;

delete from public.schema_migrations
  where filename = '0184_organization_shared_artifacts.sql';

commit;
