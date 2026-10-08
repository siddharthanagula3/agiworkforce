-- =============================================================================
-- Migration 0356: a disabled plugin takes its connectors out of use
--
-- Why    : turning a plugin off left the remote servers it added as live custom
--          connectors, so the model could still call them. Only uninstalling
--          removed them. Turning a plugin off now sets this marker on the
--          connectors it added, the runtime skips marked rows, and turning the
--          plugin back on clears it. The row, its saved credential and its
--          sign-in grant are kept, so re-enabling needs no new sign-in.
--
-- Shape  : disabled_by_plugin_at is the time the owning plugin was turned off,
--          null while the connector is in use. Additive and nullable.
--
-- Depends: 0332 (installed_by_plugin)
-- =============================================================================

begin;

alter table public.user_custom_connectors
  add column if not exists disabled_by_plugin_at timestamptz;

comment on column public.user_custom_connectors.disabled_by_plugin_at is
  'Set while the plugin named in installed_by_plugin is turned off. The connector is not offered to the model or run while set; cleared when the plugin is turned back on.';

commit;
