-- Reversal of 0175 : return plugin sources to repository-backed only.
--
-- WHAT THIS COSTS: every plugin an account uploaded or authored in the product
-- is deleted, along with its entries, its stored file bodies and every
-- installation of it. Those rows are the only copy: an uploaded plugin has no
-- repository to re-fetch from, which is the whole reason 0175 stored its files
-- at all. The delete below is not incidental cleanup, it is the price of
-- restoring repository_url to NOT NULL, and it cannot be undone by re-running
-- 0175.
--
-- Run this only while no upload or authored source exists, or after taking a
-- restore point. Repository-backed sources, which are every row 0159 through
-- 0174 could create, are untouched.

begin;

delete from public.plugin_marketplace_sources
 where kind <> 'repository' or repository_url is null;

alter table public.plugin_marketplace_sources
  drop constraint if exists plugin_marketplace_sources_repository_url_by_kind;

alter table public.plugin_marketplace_sources
  alter column repository_url set not null;

alter table public.plugin_marketplace_sources
  add constraint plugin_marketplace_sources_repository_url_check
  check (repository_url ~ '^https://github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$');

alter table public.plugin_marketplace_sources
  drop constraint if exists plugin_marketplace_sources_kind_known;

alter table public.plugin_marketplace_sources
  drop column if exists kind;

drop policy if exists plugin_marketplace_entry_files_owner_isolation
  on public.plugin_marketplace_entry_files;

alter table if exists public.plugin_marketplace_entry_files
  no force row level security;
alter table if exists public.plugin_marketplace_entry_files
  disable row level security;

drop table if exists public.plugin_marketplace_entry_files;

delete from public.schema_migrations
 where filename = '0175_plugin_marketplace_uploads.sql';

commit;
