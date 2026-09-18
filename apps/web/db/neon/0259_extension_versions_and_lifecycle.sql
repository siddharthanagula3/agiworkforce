-- =============================================================================
-- Migration 0259: version and lifecycle for every installable extension
--
-- Why    : 0096 gives a plugin one `version` column and a three-value status,
--          so publishing, deprecating and rolling back are all DB migrations.
--          There is no record of what a plugin was before its current version,
--          which means rollback has nothing to roll back TO, and no way to stop
--          one bad version without withdrawing the whole entry. Connectors,
--          skills and MCP servers carry no version at all, so "all are
--          versioned" was true of exactly one of the four.
--
-- Versions: `plugin_registry_versions` is the history the entry points into.
--          Each row carries its own status and artifact, so a single bad
--          version is suspended fleet-wide while the rest stay installable, and
--          rollback repoints the entry at the newest still-published version.
--          The entry keeps its `version` column as the CURRENT pointer, so
--          every existing reader keeps working unchanged.
--
-- Lifecycle: draft -> in_review -> published, and from published either
--          deprecated (installable, discouraged) or suspended (not installable,
--          and existing installs stop). Both are reversible by republishing,
--          which is why nothing is deleted. The LIFECYCLE LIVES ON THE VERSION,
--          not on the entry: `PluginRegistryStatus` in the shared contract has
--          three values, and widening the entry's column past them would make
--          every catalogue read throw. An entry whose current version is
--          suspended reads as `deprecated`, which is the existing value that
--          already means do not install.
--
-- Audit  : `plugin_registry_lifecycle_events` records who moved a version and
--          why. An admin action that stops other people's installs must be
--          attributable; the previous mechanism, a migration, at least had a
--          commit to point at.
--
-- Backfill: every existing entry gets one version row matching what it already
--          serves, so the history is never empty for a plugin that exists.
--
-- Depends: 0048 (user_connectors), 0096 (plugin_registry_entries),
--          0109 (plugin_installations), 0157 (user_skills),
--          0250 (organization_mcp_servers)
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.plugin_registry_versions (
  plugin_id text NOT NULL
    REFERENCES public.plugin_registry_entries(id) ON DELETE CASCADE,
  version text NOT NULL
    CHECK (version ~ '^[0-9]+\.[0-9]+\.[0-9]+([-+][0-9A-Za-z.-]+)*$'),
  status text NOT NULL DEFAULT 'draft' CHECK (
    status IN ('draft', 'in_review', 'published', 'deprecated', 'suspended')
  ),
  manifest jsonb CHECK (manifest IS NULL OR jsonb_typeof(manifest) = 'object'),
  manifest_url text,
  sha256 text CHECK (sha256 IS NULL OR sha256 ~ '^[0-9a-f]{64}$'),
  declared_skills jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(declared_skills) = 'array'),
  permissions jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(permissions) = 'array'),
  changelog text NOT NULL DEFAULT '' CHECK (length(changelog) <= 8000),
  -- Why this version was suspended or deprecated. A member told their plugin
  -- stopped is owed the reason, so the column that stops it carries one.
  lifecycle_reason text CHECK (lifecycle_reason IS NULL OR length(lifecycle_reason) <= 2000),
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (plugin_id, version),
  CONSTRAINT plugin_registry_versions_published_has_a_date
    CHECK (status <> 'published' OR published_at IS NOT NULL),
  CONSTRAINT plugin_registry_versions_stopped_has_a_reason
    CHECK (status NOT IN ('deprecated', 'suspended') OR lifecycle_reason IS NOT NULL)
);

-- Rollback reads the newest still-published version of one plugin.
CREATE INDEX IF NOT EXISTS plugin_registry_versions_rollback_idx
  ON public.plugin_registry_versions (plugin_id, published_at DESC)
  WHERE status = 'published';

COMMENT ON TABLE public.plugin_registry_versions IS
  'Per-version lifecycle and artifact for a registry entry. The entry version column is the current pointer into this history.';

CREATE TABLE IF NOT EXISTS public.plugin_registry_lifecycle_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plugin_id text NOT NULL
    REFERENCES public.plugin_registry_entries(id) ON DELETE CASCADE,
  version text NOT NULL,
  action text NOT NULL CHECK (
    action IN ('submit', 'publish', 'deprecate', 'suspend', 'restore', 'rollback')
  ),
  from_status text,
  to_status text NOT NULL,
  reason text CHECK (reason IS NULL OR length(reason) <= 2000),
  actor_user_id text NOT NULL CHECK (length(actor_user_id) BETWEEN 1 AND 255),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS plugin_registry_lifecycle_events_plugin_idx
  ON public.plugin_registry_lifecycle_events (plugin_id, created_at DESC);

COMMENT ON TABLE public.plugin_registry_lifecycle_events IS
  'Who moved which plugin version, when and why. An admin action that stops other people''s installs must be attributable.';

-- An installation pins the version it admitted. 0109 records it; naming it here
-- is what lets a suspension find the installs it must stop.
CREATE INDEX IF NOT EXISTS plugin_installations_pinned_version_idx
  ON public.plugin_installations (plugin_id, installed_version);

-- The other three installable kinds gain the version the registry always had.
-- Empty string is not allowed; NULL means the source never declared one, which
-- is the honest answer for a row that predates this migration.
ALTER TABLE public.user_connectors
  ADD COLUMN IF NOT EXISTS version text
    CHECK (version IS NULL OR version ~ '^[0-9]+\.[0-9]+\.[0-9]+([-+][0-9A-Za-z.-]+)*$');
ALTER TABLE public.user_skills
  ADD COLUMN IF NOT EXISTS version text
    CHECK (version IS NULL OR version ~ '^[0-9]+\.[0-9]+\.[0-9]+([-+][0-9A-Za-z.-]+)*$');
ALTER TABLE public.organization_mcp_servers
  ADD COLUMN IF NOT EXISTS version text
    CHECK (version IS NULL OR version ~ '^[0-9]+\.[0-9]+\.[0-9]+([-+][0-9A-Za-z.-]+)*$');

COMMENT ON COLUMN public.user_connectors.version IS
  'Semver of the connector definition this row was installed from. NULL means the source declared none.';
COMMENT ON COLUMN public.user_skills.version IS
  'Semver of the skill this row was installed from. NULL means the source declared none.';
COMMENT ON COLUMN public.organization_mcp_servers.version IS
  'Semver the published MCP server reported. NULL means the server declared none.';

DROP TRIGGER IF EXISTS set_plugin_registry_versions_updated_at
  ON public.plugin_registry_versions;
CREATE TRIGGER set_plugin_registry_versions_updated_at
  BEFORE UPDATE ON public.plugin_registry_versions
  FOR EACH ROW EXECUTE FUNCTION public.set_row_updated_at();

-- Version history is as public as the catalogue it describes, and mutated only
-- by the service role, exactly as 0096 set up for the entries themselves.
GRANT SELECT ON public.plugin_registry_versions TO app_rls;
ALTER TABLE public.plugin_registry_versions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS plugin_registry_versions_public_read ON public.plugin_registry_versions;
CREATE POLICY plugin_registry_versions_public_read
  ON public.plugin_registry_versions FOR SELECT TO app_rls
  USING (true);

-- The audit log names operators and their reasons; members never read it.
REVOKE ALL ON public.plugin_registry_lifecycle_events FROM public;
ALTER TABLE public.plugin_registry_lifecycle_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plugin_registry_lifecycle_events FORCE ROW LEVEL SECURITY;

-- Backfill: every entry gets the version it already serves, at the status it
-- already has, so no plugin starts life with an empty history.
INSERT INTO public.plugin_registry_versions (
  plugin_id, version, status, manifest, manifest_url, sha256,
  declared_skills, permissions, changelog, lifecycle_reason, published_at
)
SELECT id,
       version,
       CASE WHEN status = 'published' THEN 'published'
            WHEN status = 'deprecated' THEN 'deprecated'
            ELSE 'draft' END,
       manifest,
       manifest_url,
       sha256,
       declared_skills,
       permissions,
       '',
       CASE WHEN status = 'deprecated' THEN 'Deprecated before version history existed.' END,
       CASE WHEN status = 'published' THEN created_at END
  FROM public.plugin_registry_entries
ON CONFLICT (plugin_id, version) DO NOTHING;

COMMIT;

-- =============================================================================
-- VERIFICATION — run MANUALLY on a throwaway Neon BRANCH before production.
-- (Commented so it never runs during apply.)
-- =============================================================================
-- -- 1. Every entry has exactly one backfilled version and nothing is stranded:
-- --    SELECT count(*) FROM public.plugin_registry_entries e
-- --     WHERE NOT EXISTS (SELECT 1 FROM public.plugin_registry_versions v
-- --                        WHERE v.plugin_id = e.id AND v.version = e.version);
-- --                                                              -- EXPECT: 0
--
-- -- 2. No entry changed status:
-- --    SELECT status, count(*) FROM public.plugin_registry_entries GROUP BY 1;
-- --    EXPECT: the same distribution as before the apply.
--
-- -- 3. A stop without a reason is impossible:
-- --    UPDATE public.plugin_registry_versions SET status = 'suspended',
-- --           lifecycle_reason = NULL WHERE plugin_id = 'research-pack';
-- --                                                              -- EXPECT: check violation
--
-- -- 4. The application role cannot write the catalogue or its history:
-- --    SET ROLE app_rls;
-- --    UPDATE public.plugin_registry_versions SET changelog = 'x';
-- --                                                              -- EXPECT: permission denied
-- --    SELECT count(*) FROM public.plugin_registry_lifecycle_events;
-- --                                                              -- EXPECT: permission denied
-- =============================================================================
