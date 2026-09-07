-- 0175 : plugin sources a user uploads or authors, rather than points at.
--
-- NOT YET APPLIED : draft only, pending explicit approval before running.
--
-- 0159 gave every plugin source a mandatory github identity:
--
--   repository_url text not null
--     check (repository_url ~ '^https://github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$')
--
-- That shape is right for the one path it was written for, a marketplace the
-- server fetches and re-fetches from a fixed, known host. It is wrong for a
-- plugin the user hands us directly. A zip upload and a plugin authored in the
-- product have no repository, so every such row would have to claim a URL that
-- does not exist: a dead Repository link in the plugin detail, and a
-- refreshMarketplaceSource that fails forever and parks the source in
-- status = 'error'.
--
-- WHY A kind COLUMN AND NOT A NULLABLE repository_url ALONE: null answers "we
-- do not have one", not "there is none to have". The refresh path, the detail
-- view and the skill read path each need to know which of the three a source
-- is before they decide whether an absent repository is a fault or a fact.
-- kind says so in one column, defaults to 'repository' so every existing row
-- stays exactly what it was, and lets the URL-shape restriction keep applying
-- with full force where the server actually makes an outbound fetch.
--
-- The constraint below is therefore two-sided. A repository source must carry
-- a github.com URL, unchanged from 0159. An upload or authored source must
-- carry none: a synthesised URL on a source nothing can fetch is the exact
-- failure this migration exists to prevent, so the schema refuses it rather
-- than trusting every future writer to leave the column alone.
--
-- WHY plugin_marketplace_entry_files: a repository-backed plugin's skill
-- bodies are not stored at all. installDirectoryPlugin fetches them from
-- github and writes them to public.mcp_response_cache through
-- writeInstalledSkills, keyed by repository, plugin and revision, with a 90
-- day TTL, and listInstalledDirectorySkills re-fetches on a miss. An uploaded
-- plugin has no origin to re-fetch from, so its skills would vanish when that
-- cache entry expired, silently, which AGENTS.md section 9 forbids. That table
-- is also written with scope 'public', which is the wrong home for one
-- account's private content whatever its expiry. This table is the durable
-- home: the file bodies an upload or an authored plugin arrived with, owned by
-- the entry, cascading with it.
--
-- byte_size is checked against octet_length(content) rather than left as a
-- number a writer supplies. A stored size that can disagree with the stored
-- bytes is worse than no stored size, and the ceilings that decide whether an
-- upload is accepted at all belong to the application constants
-- (PLUGIN_MARKETPLACE_MAX_MANIFEST_BYTES, PLUGIN_DIRECTORY_MAX_SKILLS_PER_INSTALL),
-- which this migration must not duplicate into a check that can drift from
-- them.
--
-- NO SEPARATE READ INDEX: the read path loads every file for an entry, and
-- plugin_marketplace_entry_files_entry_path_unique is a btree on
-- (entry_id, path) whose leading column is exactly that predicate. A second
-- index on entry_id alone would be write cost for no read.
--
-- RLS: entries are reached through their source's owner, not through a user_id
-- column of their own, so files are reached through their entry's source's
-- owner. The policy below is the two-hop form of the policy 0159 wrote for
-- plugin_marketplace_entries, and force row level security keeps it in effect
-- for the table's owner as well.

alter table public.plugin_marketplace_sources
  add column if not exists kind text not null default 'repository';

alter table public.plugin_marketplace_sources
  drop constraint if exists plugin_marketplace_sources_kind_known;
alter table public.plugin_marketplace_sources
  add constraint plugin_marketplace_sources_kind_known
  check (kind in ('repository', 'upload', 'authored'));

alter table public.plugin_marketplace_sources
  alter column repository_url drop not null;

alter table public.plugin_marketplace_sources
  drop constraint if exists plugin_marketplace_sources_repository_url_check;

alter table public.plugin_marketplace_sources
  add constraint plugin_marketplace_sources_repository_url_by_kind
  check (
    case
      when kind = 'repository' then
        repository_url is not null
        and repository_url ~ '^https://github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$'
      else repository_url is null
    end
  );

comment on column public.plugin_marketplace_sources.kind is
  'Where this source came from: ''repository'' is a github.com marketplace the server fetches and refreshes, ''upload'' is a zip the account sent us, ''authored'' is a plugin written in the product. Only ''repository'' carries a repository_url, and only ''repository'' is refreshable.';

create table if not exists public.plugin_marketplace_entry_files (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.plugin_marketplace_entries(id) on delete cascade,
  path text not null check (char_length(path) between 1 and 400),
  content text not null check (char_length(content) > 0),
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  byte_size integer not null check (byte_size = octet_length(content)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint plugin_marketplace_entry_files_entry_path_unique unique (entry_id, path)
);

grant select, insert, update, delete on public.plugin_marketplace_entry_files to app_rls;

alter table public.plugin_marketplace_entry_files enable row level security;
alter table public.plugin_marketplace_entry_files force row level security;

drop policy if exists plugin_marketplace_entry_files_owner_isolation
  on public.plugin_marketplace_entry_files;
create policy plugin_marketplace_entry_files_owner_isolation
  on public.plugin_marketplace_entry_files for all to app_rls
  using (
    entry_id in (
      select entries.id
        from public.plugin_marketplace_entries entries
        join public.plugin_marketplace_sources sources on sources.id = entries.source_id
       where sources.user_id = public.current_app_user_id()
    )
  )
  with check (
    entry_id in (
      select entries.id
        from public.plugin_marketplace_entries entries
        join public.plugin_marketplace_sources sources on sources.id = entries.source_id
       where sources.user_id = public.current_app_user_id()
    )
  );

comment on table public.plugin_marketplace_entry_files is
  'The file bodies of a plugin that has no repository to fetch them from: one row per file of an uploaded or authored plugin_marketplace_entries row. Repository-backed entries store nothing here and keep fetching from their origin.';
