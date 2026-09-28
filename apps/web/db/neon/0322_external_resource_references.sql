-- =============================================================================
-- Migration 0322: one canonical record for the external resources a user reaches
--
-- Why    : A repository URL on a Code session, source URLs inside message
--          metadata, MCP server URLs on connector grants and files imported
--          from a connector each kept their own copy of "which outside thing is
--          this", with no shared identity, version or access. A reference is
--          now one row per resource, per account and workspace, classified by
--          kind and keyed by a canonical identity.
--
-- Shape  : identity_key is the canonical identity computed by
--          packages/contracts/types/src/external-resource-reference.ts and is
--          unique per account and workspace; workspace_key folds the personal
--          workspace into the key so one index covers both. version and
--          version_kind are both null when the provider exposes no version.
--          access says whether the resource was public or reached through a
--          connector account, which connector_id and account_key name.
--          project_knowledge_files.external_reference_id links a project source
--          to the resource it was imported from.
--
-- Depends: 0006 (project_knowledge_files), 0015 (organizations),
--          0037 (profiles, current_app_user_id), 0076 (set_row_updated_at),
--          0272 (app_row_is_visible, app_row_is_writable)
-- =============================================================================

begin;

create table if not exists public.external_resource_references (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.profiles(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete cascade,
  workspace_key text generated always as (coalesce(organization_id::text, '')) stored,
  kind text not null
    check (kind in ('repository', 'web_page', 'mcp_server', 'connector_item')),
  provider text not null check (provider ~ '^[a-z0-9][a-z0-9_.-]{0,63}$'),
  identity_key text not null check (char_length(identity_key) between 1 and 2048),
  uri text not null check (char_length(uri) between 1 and 2048),
  external_id text check (external_id is null or char_length(external_id) between 1 and 512),
  title text check (title is null or char_length(title) <= 500),
  version text check (version is null or char_length(version) between 1 and 200),
  version_kind text check (
    version_kind is null
    or version_kind in ('commit', 'branch', 'revision', 'modified_at', 'content_hash')
  ),
  access text not null check (access in ('public', 'connector')),
  connector_id text check (connector_id is null or char_length(connector_id) between 1 and 200),
  account_key text check (account_key is null or char_length(account_key) between 1 and 200),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint external_resource_references_version_pair
    check ((version is null) = (version_kind is null)),
  constraint external_resource_references_connector_access
    check (access <> 'connector' or connector_id is not null)
);

create unique index if not exists external_resource_references_identity_idx
  on public.external_resource_references (user_id, workspace_key, identity_key);

create index if not exists external_resource_references_kind_idx
  on public.external_resource_references (user_id, kind, last_seen_at desc);

drop trigger if exists set_external_resource_references_updated_at
  on public.external_resource_references;
create trigger set_external_resource_references_updated_at
  before update on public.external_resource_references
  for each row execute function public.set_row_updated_at();

revoke all on public.external_resource_references from app_rls;
grant select, insert, update, delete on public.external_resource_references to app_rls;

alter table public.external_resource_references enable row level security;
alter table public.external_resource_references force row level security;

drop policy if exists external_resource_references_tenant_isolation
  on public.external_resource_references;
create policy external_resource_references_tenant_isolation
  on public.external_resource_references
  using (public.app_row_is_visible(user_id, organization_id))
  with check (
    user_id = (select public.current_app_user_id())
    and public.app_row_is_writable(user_id, organization_id)
  );

alter table public.project_knowledge_files
  add column if not exists external_reference_id uuid
    references public.external_resource_references(id) on delete set null;

create index if not exists project_knowledge_files_external_reference_idx
  on public.project_knowledge_files (external_reference_id)
  where external_reference_id is not null;

comment on table public.external_resource_references is
  'The canonical record of an external resource an account reached: a repository, a web page, an MCP server or a connector item, with its canonical identity, its version when the provider exposes one, and whether it was public or reached through a connector account.';
comment on column public.external_resource_references.identity_key is
  'Canonical identity from packages/contracts/types/src/external-resource-reference.ts, unique per account and workspace.';
comment on column public.project_knowledge_files.external_reference_id is
  'The external resource this project source was imported from, null for an upload.';

commit;
