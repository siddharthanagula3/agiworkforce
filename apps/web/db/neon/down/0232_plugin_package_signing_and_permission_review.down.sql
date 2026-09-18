-- Reversal of 0232.
--
-- Lost: a published entry may again carry no digest and no signature, unscanned
-- packages install, and a permission-expanding update applies silently. 0096's
-- constraint is restored, which requires clearing any signature written since.

begin;

alter table public.plugin_registry_entries
  drop constraint if exists plugin_registry_entries_published_is_signed;
alter table public.plugin_registry_entries
  drop constraint if exists plugin_registry_entries_signature_pairs_with_algorithm;

update public.plugin_registry_entries
   set signature = null, signature_algorithm = null
 where signature is not null or signature_algorithm is not null;

alter table public.plugin_registry_entries
  add constraint plugin_registry_entries_unsigned_until_policy
  check (signature is null and signature_algorithm is null);

alter table public.plugin_installations
  drop constraint if exists plugin_installations_permission_shapes;
alter table public.plugin_installations
  drop column if exists review_required,
  drop column if exists pending_permissions,
  drop column if exists approved_permissions;

alter table public.plugin_marketplace_installations
  drop constraint if exists plugin_marketplace_installations_permission_shapes;
alter table public.plugin_marketplace_installations
  drop column if exists review_required,
  drop column if exists pending_permissions,
  drop column if exists approved_permissions;

drop index if exists public.idx_plugin_package_scans_plugin;

drop table if exists public.plugin_package_scans;

delete from public.schema_migrations
 where filename = '0232_plugin_package_signing_and_permission_review.sql';

commit;
