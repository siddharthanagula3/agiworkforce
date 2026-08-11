-- Reversal of 0109 — remove Web installs and restore the preview-only registry.

BEGIN;

drop table if exists public.plugin_installations;

update public.plugin_registry_entries
   set version = '0.9.1',
       description = 'Deep web research with source citation, structured literature review, and fact-check verification against live sources.',
       source = 'marketplace',
       status = 'preview',
       declared_skills = '["Web Researcher", "Citation Formatter", "Fact Checker"]'::jsonb,
       required_connectors = '[]'::jsonb,
       capabilities = '["network"]'::jsonb,
       permissions = '[]'::jsonb,
       manifest = null,
       manifest_url = null,
       sha256 = null,
       web_installable = false,
       updated_at = now()
 where id = 'research-pack';

alter table public.plugin_registry_entries
  drop constraint if exists plugin_registry_entries_web_pack_is_embedded;
alter table public.plugin_registry_entries
  drop constraint if exists plugin_registry_entries_published_needs_artifact_or_web_pack;
alter table public.plugin_registry_entries
  drop column if exists web_installable;
alter table public.plugin_registry_entries
  add constraint plugin_registry_entries_published_needs_artifact
  check (status <> 'published' or manifest_url is not null);

delete from public.schema_migrations
 where filename = '0109_web_plugin_installations.sql';

COMMIT;
