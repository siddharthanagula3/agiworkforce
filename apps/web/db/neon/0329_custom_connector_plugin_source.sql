-- =============================================================================
-- Migration 0329: remember which plugin added a custom connector
--
-- Why    : a plugin's remote MCP servers were listed on its page and never
--          run on the web. Installing a plugin now adds each of its remote
--          servers as one of the member's custom connectors, where they sign
--          in and run like any other, and removing the plugin removes them.
--          Removing only what the plugin added needs to know which rows those
--          are; a connector the member added themselves is left alone.
--
-- Shape  : installed_by_plugin is the plugin key that added the connector,
--          null for one the member added. Additive and nullable.
--
-- Depends: 0052 (user_custom_connectors)
-- =============================================================================

begin;

alter table public.user_custom_connectors
  add column if not exists installed_by_plugin text
    check (installed_by_plugin is null or char_length(installed_by_plugin) between 1 and 200);

create index if not exists idx_user_custom_connectors_plugin
  on public.user_custom_connectors (user_id, installed_by_plugin)
  where installed_by_plugin is not null;

comment on column public.user_custom_connectors.installed_by_plugin is
  'The plugin key whose remote MCP server this connector is, removed with that plugin. Null when the member added it.';

commit;
