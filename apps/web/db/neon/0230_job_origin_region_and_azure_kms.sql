-- =============================================================================
-- Migration 0230: the region a job came from, and Azure as a third key vendor
--
-- NOT YET APPLIED : draft only, pending explicit approval before running.
--
-- Region : 0220 pins a WORKSPACE to a region. Deferred work escaped that pin:
--          `background_jobs` carried the tenant but not the region the work
--          originated in, so a drain running anywhere could claim a row that
--          belongs to a jurisdiction it is not in, and nothing afterwards could
--          say which region a completed job ran in. `origin_region` is stamped
--          at enqueue from the workspace's own `data_region`, so the column is
--          derived from the pin rather than trusted from the caller, and null
--          means the home region exactly as it does on `organizations`.
--
-- Azure  : 0220 constrained `organization_encryption_keys.provider` to the two
--          vendors the code spoke at the time. `apps/web/lib/crypto/kms-providers.ts`
--          now speaks Azure Key Vault as well, and a check constraint that
--          contradicts the code is a row a customer cannot write for no reason
--          they can see. The constraint is replaced, not relaxed: 'local' stays
--          refused in production by `createLocalCmekProvider` itself.
--
-- Depends: 0015 (organizations), 0208 (background_jobs), 0220 (data_region,
--          organization_encryption_keys)
-- =============================================================================

begin;

alter table public.background_jobs
  add column if not exists origin_region text
    check (origin_region is null or origin_region in ('us', 'eu'));

comment on column public.background_jobs.origin_region is
  'The data region this work originated in, stamped from the workspace''s pin at enqueue. Null is the home region. A drain serving one region claims only its own rows.';

create index if not exists idx_background_jobs_claimable_by_region
  on public.background_jobs (origin_region, queue, priority desc, run_after asc, id)
  where status = 'queued';

do $$
declare
  constraint_name text;
begin
  if to_regclass('public.organization_encryption_keys') is null then
    raise notice '0230: organization_encryption_keys absent, skipping provider widening';
    return;
  end if;

  select conname into constraint_name
    from pg_constraint
   where conrelid = 'public.organization_encryption_keys'::regclass
     and contype = 'c'
     and pg_get_constraintdef(oid) ilike '%provider%'
   limit 1;

  if constraint_name is not null then
    execute format(
      'alter table public.organization_encryption_keys drop constraint %I',
      constraint_name
    );
  end if;

  execute $ck$
    alter table public.organization_encryption_keys
      add constraint organization_encryption_keys_provider_check
      check (provider in ('aws_kms', 'gcp_kms', 'azure_key_vault', 'local'))
  $ck$;
end $$;

commit;

-- =============================================================================
-- VERIFICATION — run MANUALLY on a throwaway Neon BRANCH before production.
-- (Commented so it never runs during apply.)
-- =============================================================================
-- -- 1. A job cannot claim a region this build does not declare:
-- --    UPDATE public.background_jobs SET origin_region = 'ap-southeast';
-- --    EXPECT: check violation.
--
-- -- 2. Enqueue stamps the workspace's pin, not the caller's claim:
-- --    UPDATE public.organizations SET data_region = 'eu' WHERE id = '<org>';
-- --    (enqueue a job for <org> through enqueueJob with no originRegion)
-- --    SELECT origin_region FROM public.background_jobs ORDER BY created_at DESC LIMIT 1;
-- --    EXPECT: eu.
--
-- -- 3. Azure is now a writable provider and an undeclared one still is not:
-- --    INSERT INTO public.organization_encryption_keys
-- --      (organization_id, provider, key_uri, key_region, key_version,
-- --       wrapped_data_key, created_by_user_id)
-- --      VALUES ('<org>', 'azure_key_vault', 'https://v.vault.azure.net/keys/k/1',
-- --              'westeurope', '1', 'AAAA', 'u');
-- --    EXPECT: success.
-- --    ... same INSERT with provider 'hashicorp_vault'
-- --    EXPECT: check violation.
