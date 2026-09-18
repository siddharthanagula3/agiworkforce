-- 0232 : plugin package signing, a recorded scan verdict, and the permission
--        set a member actually approved.
--
-- NOT YET APPLIED : draft only, pending explicit approval before running.
--
-- Replaces 0096's plugin_registry_entries_unsigned_until_policy, which kept
-- `signature` NULL so a null could never read as verified. A published row must
-- now carry a digest AND a signature, so a null cannot reach an install path.
--
-- Depends: 0096 (plugin_registry_entries, plugin_installations),
--          0184 (plugin_marketplace_installations)

begin;

alter table public.plugin_registry_entries
  drop constraint if exists plugin_registry_entries_unsigned_until_policy;

alter table public.plugin_registry_entries
  drop constraint if exists plugin_registry_entries_signature_pairs_with_algorithm;
alter table public.plugin_registry_entries
  add constraint plugin_registry_entries_signature_pairs_with_algorithm check (
    (signature is null and signature_algorithm is null)
    or (signature is not null and signature_algorithm in ('ed25519'))
  );

alter table public.plugin_registry_entries
  drop constraint if exists plugin_registry_entries_published_is_signed;
alter table public.plugin_registry_entries
  add constraint plugin_registry_entries_published_is_signed check (
    status <> 'published' or (sha256 is not null and signature is not null)
  );

alter table public.plugin_installations
  add column if not exists approved_permissions jsonb not null default '[]'::jsonb,
  add column if not exists pending_permissions jsonb,
  add column if not exists review_required boolean not null default false;

alter table public.plugin_installations
  drop constraint if exists plugin_installations_permission_shapes;
alter table public.plugin_installations
  add constraint plugin_installations_permission_shapes check (
    jsonb_typeof(approved_permissions) = 'array'
    and (pending_permissions is null or jsonb_typeof(pending_permissions) = 'array')
    and (review_required = false or pending_permissions is not null)
  );

alter table public.plugin_marketplace_installations
  add column if not exists approved_permissions jsonb not null default '[]'::jsonb,
  add column if not exists pending_permissions jsonb,
  add column if not exists review_required boolean not null default false;

-- Backfill, or the next refresh reads every declared permission as new and
-- disables working installations for a change nobody made.
update public.plugin_installations installation
   set approved_permissions = coalesce(registry.permissions, '[]'::jsonb)
  from public.plugin_registry_entries registry
 where registry.id = installation.plugin_id
   and installation.approved_permissions = '[]'::jsonb;

update public.plugin_marketplace_installations installation
   set approved_permissions = coalesce(entries.permissions, '[]'::jsonb)
  from public.plugin_marketplace_entries entries
 where entries.id = installation.entry_id
   and installation.approved_permissions = '[]'::jsonb;

alter table public.plugin_marketplace_installations
  drop constraint if exists plugin_marketplace_installations_permission_shapes;
alter table public.plugin_marketplace_installations
  add constraint plugin_marketplace_installations_permission_shapes check (
    jsonb_typeof(approved_permissions) = 'array'
    and (pending_permissions is null or jsonb_typeof(pending_permissions) = 'array')
    and (review_required = false or pending_permissions is not null)
  );

-- Keyed on the content hash, not the plugin, so a republished artifact is a new
-- row and can never inherit the previous version's pass.
create table if not exists public.plugin_package_scans (
  content_hash text primary key check (content_hash ~ '^[0-9a-f]{64}$'),
  plugin_key text not null check (length(plugin_key) between 1 and 200),
  verdict text not null check (verdict in ('pass', 'review', 'block')),
  rules_version integer not null check (rules_version > 0),
  findings jsonb not null default '[]'::jsonb check (jsonb_typeof(findings) = 'array'),
  scanned_files integer not null default 0 check (scanned_files >= 0),
  scanned_at timestamptz not null default now()
);

create index if not exists idx_plugin_package_scans_plugin
  on public.plugin_package_scans (plugin_key, scanned_at desc);

-- No user_id and no app_rls grant: following 0231, platform state with no tenant
-- scope is withheld from the application role rather than policed.

comment on table public.plugin_package_scans is
  'Static content-scan verdict for one plugin/skill package artifact, keyed by its sha256. Platform state with no tenant scope: not granted to app_rls, read and written only by the service role that runs the scanner. Absence means never scanned, which install treats as a refusal, not as a pass.';

comment on column public.plugin_registry_entries.signature is
  'Detached Ed25519 signature over "agiworkforce-plugin:v1\n<id>\n<version>\n<sha256>", the payload packages/client/client-runtime/src/plugins/signature.ts defines for signer and verifier alike. The id and version are inside it so a signature cannot be replayed onto another entry sharing an artifact. Verified on install against the PUBLIC keys in PLUGIN_SIGNING_PUBLIC_KEYS; the private key is held by the release process, never by this repository, this database or any application environment, so neither a database nor an app-server compromise can mint a package that verifies.';

comment on column public.plugin_installations.approved_permissions is
  'The permission set the member approved at install. An update declaring anything outside it sets review_required and does not take effect.';

comment on column public.plugin_marketplace_installations.approved_permissions is
  'The permission set the member approved at install. An update declaring anything outside it sets review_required and does not take effect.';

commit;

-- =============================================================================
-- VERIFICATION, run MANUALLY on a throwaway Neon BRANCH before production.
-- =============================================================================
-- -- 1. No existing published row is left unsigned (all seeded rows are preview):
-- --    SELECT count(*) FROM public.plugin_registry_entries
-- --     WHERE status = 'published' AND (sha256 IS NULL OR signature IS NULL);
-- --    EXPECT: 0   (a nonzero result means this migration would have failed)
--
-- -- 2. A signature without an algorithm is refused:
-- --    UPDATE public.plugin_registry_entries SET signature = 'x' WHERE id = 'research-pack';
-- --    EXPECT: ERROR violates check constraint plugin_registry_entries_signature_pairs_with_algorithm
--
-- -- 3. Every existing installation keeps working and is not in review:
-- --    SELECT count(*) FROM public.plugin_installations WHERE review_required;   -- EXPECT: 0
-- --    SELECT count(*) FROM public.plugin_marketplace_installations WHERE review_required; -- EXPECT: 0
--
-- -- 4. The application role can neither read nor write scan verdicts:
-- --    SET ROLE app_rls;
-- --    SELECT count(*) FROM public.plugin_package_scans;   -- EXPECT: ERROR permission denied
-- --    INSERT INTO public.plugin_package_scans (content_hash, plugin_key, verdict, rules_version)
-- --    VALUES (repeat('a', 64), 'x', 'pass', 1);           -- EXPECT: ERROR permission denied
-- =============================================================================
