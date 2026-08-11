-- 0109 — user-owned Web plugin installations and one embedded first-party pack.
--
-- Web previously exposed a read-only plugin directory while its local Zustand
-- installer was deliberately disabled. This migration adds the missing
-- durable admission state. A Web-installable plugin is still NOT a CLI artifact:
-- `distribution` remains null, so CLI/Desktop keep requiring an independently
-- downloadable, integrity-pinned bundle.

alter table public.plugin_registry_entries
  add column if not exists web_installable boolean not null default false;

alter table public.plugin_registry_entries
  drop constraint if exists plugin_registry_entries_published_needs_artifact;

alter table public.plugin_registry_entries
  add constraint plugin_registry_entries_published_needs_artifact_or_web_pack
  check (status <> 'published' or manifest_url is not null or web_installable);

alter table public.plugin_registry_entries
  drop constraint if exists plugin_registry_entries_web_pack_is_embedded;

alter table public.plugin_registry_entries
  add constraint plugin_registry_entries_web_pack_is_embedded
  check (
    not web_installable
    or (
      status = 'published'
      and source = 'builtin'
      and publisher_kind = 'first-party'
      and manifest is not null
    )
  );

comment on column public.plugin_registry_entries.web_installable is
  'True only for a first-party manifest embedded in the Managed Cloud runtime. It does not claim CLI/Desktop artifact availability.';

update public.plugin_registry_entries
   set version = '1.0.0',
       description = 'Install a focused literature-review workflow that synthesizes evidence, disagreement, methodological limits, and open questions without granting tools.',
       source = 'builtin',
       status = 'published',
       declared_skills = '["literature-review"]'::jsonb,
       required_connectors = '[]'::jsonb,
       capabilities = '[]'::jsonb,
       permissions = '[]'::jsonb,
       manifest = '{"name":"research-pack","version":"1.0.0","description":"A focused evidence-synthesis workflow for Managed Cloud.","skills":["literature-review"]}'::jsonb,
       manifest_url = null,
       sha256 = null,
       web_installable = true,
       updated_at = now()
 where id = 'research-pack';

create table if not exists public.plugin_installations (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.profiles(id) on delete cascade,
  plugin_id text not null references public.plugin_registry_entries(id) on delete cascade,
  installed_version text not null,
  enabled boolean not null default true,
  installed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint plugin_installations_user_plugin_unique unique (user_id, plugin_id)
);

create index if not exists idx_plugin_installations_user_enabled
  on public.plugin_installations (user_id, enabled, plugin_id);

grant select, insert, update, delete on public.plugin_installations to app_rls;

alter table public.plugin_installations enable row level security;
alter table public.plugin_installations force row level security;

drop policy if exists plugin_installations_user_isolation on public.plugin_installations;
create policy plugin_installations_user_isolation
  on public.plugin_installations for all to app_rls
  using (user_id = public.current_app_user_id())
  with check (user_id = public.current_app_user_id());

comment on table public.plugin_installations is
  'Per-user Managed Cloud plugin admission. Installing never grants tools; it only exposes skills declared by the embedded first-party manifest.';
