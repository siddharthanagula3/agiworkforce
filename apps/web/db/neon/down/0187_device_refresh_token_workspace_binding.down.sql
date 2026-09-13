-- Reversal of 0187 : drop the workspace binding on device credentials.
--
-- WHAT THIS COSTS: the record of which workspace each device credential was
-- issued in. Reapplying 0187 gives every existing row a null binding again, so
-- credentials paired before the reapply are treated as personal and a later
-- member removal revokes none of them.
--
-- ROLLBACK ORDER matters. Application code that predates the drop writes
-- organization_id on every device-credential insert, so the issuing routes fail
-- and device pairing stops working until that code is rolled back too. Roll the
-- deployment back first, then run this.

begin;

drop index if exists public.idx_device_refresh_tokens_organization;

alter table public.device_refresh_tokens
  drop column if exists organization_id;

delete from public.schema_migrations
  where filename = '0187_device_refresh_token_workspace_binding.sql';

commit;
