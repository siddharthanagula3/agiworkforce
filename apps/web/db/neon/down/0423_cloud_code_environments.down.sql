-- Reversal of 0423: the cloud environments table goes.
--
-- WHAT THIS COSTS: every saved environment, its setup script and its sealed
-- variables are deleted, and nothing else holds a copy. A session already
-- created from an environment keeps the settings it copied, so no running
-- session changes. Run before anyone saved an environment, it costs nothing.

begin;

drop policy if exists cloud_code_environments_tenant_isolation on public.cloud_code_environments;
drop trigger if exists cloud_code_environments_set_updated_at on public.cloud_code_environments;
drop index if exists public.cloud_code_environments_organization_idx;
drop index if exists public.cloud_code_environments_owner_default_key;
drop index if exists public.cloud_code_environments_owner_name_key;
alter table if exists public.cloud_code_environments
  drop constraint if exists cloud_code_environments_variables_sealed;
alter table if exists public.cloud_code_environments
  drop constraint if exists cloud_code_environments_request_key;
alter table if exists public.cloud_code_environments disable row level security;
alter table if exists public.cloud_code_environments no force row level security;
drop table if exists public.cloud_code_environments;

delete from public.schema_migrations
 where filename = '0423_cloud_code_environments.sql';

commit;
