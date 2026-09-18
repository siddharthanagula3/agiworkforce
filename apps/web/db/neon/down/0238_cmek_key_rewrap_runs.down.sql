-- Reversal of 0238, remove the customer-key rewrap record.
--
-- COST, read this before running it: this drops the only evidence that
-- ciphertext was moved off a retired key version. After it,
-- retireOrganizationKeyVersion has nothing to gate on, and a version dropped
-- from organization_encryption_keys.retired_keys takes every row still sealed
-- under it with it. Export organization_key_rewrap_runs first if any workspace
-- has ever rotated a customer-managed key.

begin;

drop policy if exists organization_key_rewrap_runs_admin_read
  on public.organization_key_rewrap_runs;

alter table if exists public.organization_key_rewrap_runs disable row level security;

drop trigger if exists set_organization_key_rewrap_runs_updated_at
  on public.organization_key_rewrap_runs;

drop index if exists public.organization_key_rewrap_runs_open_idx;
drop index if exists public.organization_key_rewrap_runs_pair_idx;

drop table if exists public.organization_key_rewrap_runs;

delete from public.schema_migrations
 where filename = '0238_cmek_key_rewrap_runs.sql';

commit;
