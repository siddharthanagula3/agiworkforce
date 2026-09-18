-- =============================================================================
-- Migration 0265: a registry entry can say what actually happened to it
--
-- Why    : 0259 gave every plugin VERSION a five-value lifecycle
--          ('draft', 'in_review', 'published', 'deprecated', 'suspended'), but
--          0096 left the ENTRY on three ('preview', 'published', 'deprecated').
--          An entry whose current version is suspended or still in review
--          therefore reads as 'deprecated' or 'preview', which is not what
--          happened: a suspension is a safety action and a review is a state
--          nobody has decided yet.
--
-- Shape  : widen the entry's status check to the same five values plus the
--          'preview' the catalogue already serves. No row changes: every
--          existing value is still valid, so this is additive.
--
-- Note   : the two artifact constraints are unchanged. A 'draft', 'in_review'
--          or 'suspended' entry is not 'published', so the artifact rule that
--          only binds 'published' still binds exactly what it did.
--
-- Depends: 0096_plugin_registry, 0259_extension_versions_and_lifecycle
-- =============================================================================

begin;

alter table public.plugin_registry_entries
  drop constraint if exists plugin_registry_entries_status_check;

alter table public.plugin_registry_entries
  add constraint plugin_registry_entries_status_check
  check (status in ('draft', 'in_review', 'preview', 'published', 'deprecated', 'suspended'));

comment on column public.plugin_registry_entries.status is
  'Availability of the entry itself. Matches the version lifecycle in 0259, so a suspended or in-review entry is not read as deprecated or preview.';

commit;
