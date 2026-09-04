-- 0160 : per-installation plugin settings: enabled skills and custom example
-- prompts.
--
-- NOT YET APPLIED : draft only, pending explicit approval before running.
--
-- The per-plugin settings surface (GET/PATCH enabled skills, example
-- prompts, and connector requirements with connect state) needs somewhere to
-- persist the two fields that are actually mutable per installation:
-- which of the plugin's declared skills this user has toggled on, and
-- whether they have overridden the plugin's default "Try asking" examples.
-- Connector requirements stay read-only, computed at request time from
-- required_connectors joined against user_connectors : nothing to persist.
--
-- enabled_skills defaults to '[]' at the column level; the install path
-- (installWebPlugin) is the one that actually populates it with the
-- plugin's full declared_skills list at install time, so an existing row
-- migrated forward is never mistaken for "user disabled everything".

alter table public.plugin_installations
  add column if not exists enabled_skills jsonb not null default '[]'::jsonb
  check (jsonb_typeof(enabled_skills) = 'array');

alter table public.plugin_installations
  add column if not exists custom_example_prompts jsonb
  check (custom_example_prompts is null or jsonb_typeof(custom_example_prompts) = 'array');

comment on column public.plugin_installations.enabled_skills is
  'The subset of the installed plugin''s declared_skills this user has toggled on. Populated with every declared skill at install time.';

comment on column public.plugin_installations.custom_example_prompts is
  'Per-user override of the plugin''s example_prompts. NULL means show the plugin''s own defaults.';

update public.plugin_installations installation
   set enabled_skills = registry.declared_skills
  from public.plugin_registry_entries registry
 where registry.id = installation.plugin_id
   and installation.enabled_skills = '[]'::jsonb;
