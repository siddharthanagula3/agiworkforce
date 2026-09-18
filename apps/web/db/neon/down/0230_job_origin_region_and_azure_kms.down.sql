-- Reversal of 0234, unpin deferred work from its region and narrow the key
-- providers back to two.
--
-- COST: dropping `background_jobs.origin_region` discards the record of which
-- jurisdiction each queued job originated in, so a drain can no longer tell
-- its own region's work from another's and the claim filter silently covers
-- everything. Run this only on a deployment serving one region. Narrowing
-- `organization_encryption_keys_provider_check` back to two vendors fails if a
-- workspace has already activated an Azure Key Vault key, which is the right
-- outcome: move that workspace to another provider before reversing, because
-- deleting its association would leave its data sealed under a key this schema
-- no longer names.

begin;

drop index if exists public.idx_background_jobs_claimable_by_region;

alter table public.background_jobs
  drop column if exists origin_region;

do $$
begin
  if to_regclass('public.organization_encryption_keys') is null then
    raise notice '0230 down: organization_encryption_keys absent, skipping provider narrowing';
    return;
  end if;

  alter table public.organization_encryption_keys
    drop constraint if exists organization_encryption_keys_provider_check;

  alter table public.organization_encryption_keys
    add constraint organization_encryption_keys_provider_check
    check (provider in ('aws_kms', 'gcp_kms', 'local'));
end $$;

delete from public.schema_migrations
 where filename = '0230_job_origin_region_and_azure_kms.sql';

commit;
