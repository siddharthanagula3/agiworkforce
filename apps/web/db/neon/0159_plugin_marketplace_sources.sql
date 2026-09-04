-- 0159 : user-registered plugin marketplace sources.
--
-- NOT YET APPLIED : draft only, pending explicit approval before running.
--
-- Web could only ever install from the curated, first-party
-- plugin_registry_entries catalogue. This migration adds the self-serve path:
-- a user points at a GitHub repository, the server resolves and validates its
-- manifest (packages/contracts/cloud-contracts/src/plugin-marketplaces.ts,
-- PLUGIN_MARKETPLACE_MANIFEST_PATH), pins its content hash, and caches the
-- plugins it declares. Registration is scoped to github.com repositories only
-- : the launch surface for "sync a marketplace from a git repository" : the
-- same URL-shape restriction that keeps the server's outbound fetch target a
-- fixed, known host rather than an arbitrary caller-supplied one.
--
-- Marketplace plugins are cached declarations, not the curated registry: they
-- get their own tables rather than joining plugin_registry_entries, whose
-- plugin_registry_entries_first_party_only constraint exists specifically to
-- keep third-party content out of that table until a review policy lands.
-- Installing a marketplace-sourced plugin is tracked in
-- plugin_marketplace_installations, parallel to plugin_installations.

create table if not exists public.plugin_marketplace_sources (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  repository_url text not null
    check (repository_url ~ '^https://github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$'),
  ref text check (ref is null or ref ~ '^[A-Za-z0-9._/-]{1,200}$'),
  status text not null default 'active' check (status in ('active', 'error')),
  last_error text,
  content_hash text check (content_hash is null or content_hash ~ '^[0-9a-f]{64}$'),
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_plugin_marketplace_sources_user_id
  on public.plugin_marketplace_sources (user_id, created_at);

grant select, insert, update, delete on public.plugin_marketplace_sources to app_rls;

alter table public.plugin_marketplace_sources enable row level security;
alter table public.plugin_marketplace_sources force row level security;

drop policy if exists plugin_marketplace_sources_user_isolation on public.plugin_marketplace_sources;
create policy plugin_marketplace_sources_user_isolation
  on public.plugin_marketplace_sources for all to app_rls
  using (user_id = public.current_app_user_id())
  with check (user_id = public.current_app_user_id());

comment on table public.plugin_marketplace_sources is
  'A user-registered plugin marketplace: a github.com repository the server fetches a manifest from, validates, and pins by content hash.';

create table if not exists public.plugin_marketplace_entries (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.plugin_marketplace_sources(id) on delete cascade,
  plugin_key text not null check (plugin_key ~ '^[a-z0-9][a-z0-9._-]{0,127}$'),
  name text not null check (char_length(name) between 1 and 200),
  description text not null check (char_length(description) between 1 and 2000),
  version text not null
    check (version ~ '^[0-9]+\.[0-9]+\.[0-9]+([-+][0-9A-Za-z.-]+)*$'),
  declared_skills jsonb not null default '[]'::jsonb
    check (jsonb_typeof(declared_skills) = 'array'),
  required_connectors jsonb not null default '[]'::jsonb
    check (jsonb_typeof(required_connectors) = 'array'),
  agents jsonb not null default '[]'::jsonb
    check (jsonb_typeof(agents) = 'array'),
  example_prompts jsonb not null default '[]'::jsonb
    check (jsonb_typeof(example_prompts) = 'array'),
  permissions jsonb not null default '[]'::jsonb
    check (jsonb_typeof(permissions) = 'array'),
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint plugin_marketplace_entries_source_key_unique unique (source_id, plugin_key)
);

create index if not exists idx_plugin_marketplace_entries_source_id
  on public.plugin_marketplace_entries (source_id, plugin_key);

grant select, insert, update, delete on public.plugin_marketplace_entries to app_rls;

alter table public.plugin_marketplace_entries enable row level security;
alter table public.plugin_marketplace_entries force row level security;

drop policy if exists plugin_marketplace_entries_owner_isolation on public.plugin_marketplace_entries;
create policy plugin_marketplace_entries_owner_isolation
  on public.plugin_marketplace_entries for all to app_rls
  using (
    source_id in (
      select id from public.plugin_marketplace_sources
       where user_id = public.current_app_user_id()
    )
  )
  with check (
    source_id in (
      select id from public.plugin_marketplace_sources
       where user_id = public.current_app_user_id()
    )
  );

comment on table public.plugin_marketplace_entries is
  'Cached, validated plugins declared by a plugin_marketplace_sources manifest. Every declared_skills and required_connectors entry was checked against the live Skill catalog and connector catalog before being written here.';

create table if not exists public.plugin_marketplace_installations (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.profiles(id) on delete cascade,
  entry_id uuid not null references public.plugin_marketplace_entries(id) on delete cascade,
  installed_version text not null,
  enabled boolean not null default true,
  enabled_skills jsonb not null default '[]'::jsonb
    check (jsonb_typeof(enabled_skills) = 'array'),
  custom_example_prompts jsonb
    check (custom_example_prompts is null or jsonb_typeof(custom_example_prompts) = 'array'),
  installed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint plugin_marketplace_installations_user_entry_unique unique (user_id, entry_id)
);

create index if not exists idx_plugin_marketplace_installations_user_enabled
  on public.plugin_marketplace_installations (user_id, enabled, entry_id);

grant select, insert, update, delete on public.plugin_marketplace_installations to app_rls;

alter table public.plugin_marketplace_installations enable row level security;
alter table public.plugin_marketplace_installations force row level security;

drop policy if exists plugin_marketplace_installations_user_isolation on public.plugin_marketplace_installations;
create policy plugin_marketplace_installations_user_isolation
  on public.plugin_marketplace_installations for all to app_rls
  using (user_id = public.current_app_user_id())
  with check (user_id = public.current_app_user_id());

comment on table public.plugin_marketplace_installations is
  'Per-user admission of a plugin_marketplace_entries row, parallel to plugin_installations for the curated registry. enabled_skills is the per-installation subset of the entry''s declared_skills the user has toggled on.';
