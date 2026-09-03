-- Reversal of 0160 — drop the per-installation settings columns.

BEGIN;

alter table public.plugin_installations
  drop column if exists enabled_skills;

alter table public.plugin_installations
  drop column if exists custom_example_prompts;

delete from public.schema_migrations
 where filename = '0160_plugin_installation_settings.sql';

COMMIT;
