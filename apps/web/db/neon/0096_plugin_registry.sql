-- 0096_plugin_registry.sql
--
-- Hosted plugin registry (CAP-046 slice 2).
--
-- Before this table the plugin catalogue existed only as a TypeScript fixture
-- (apps/web/features/plugins/data/plugins.ts). The web pages read it directly,
-- the CLI could not read it at all, and there was no way to add or correct an
-- entry without shipping a build. This table is the hosted source of truth that
-- `GET /api/plugins` serves and that
-- `apps/cli/src/features/plugins/registry.rs` resolves against.
--
-- Column shape mirrors the PluginRegistryEntry contract
-- (packages/contracts/types/src/plugins.ts) one-for-one. Nothing here stores a
-- download count, install total, or rating: the registry has never observed
-- one, and a column invites a fabricated number.
--
-- LAUNCH SCOPE IS ENFORCED IN THE DATABASE, not merely in the route:
--   * plugin_registry_entries_first_party_only — third-party submissions are a
--     pending founder decision (review + signing policy). The contract already
--     models `third-party`; this constraint is the single line to drop once the
--     decision lands, so no code change is needed to accept it later.
--   * plugin_registry_entries_unsigned_until_policy — there is no signing key,
--     no verifier, and no review process. A populated `signature` would be an
--     unverifiable safety badge, so the column must stay NULL until signing
--     ships alongside the code that checks it.
--   * plugin_registry_entries_published_needs_artifact /
--     plugin_registry_entries_preview_has_no_artifact — `status` cannot lie
--     about availability: `published` requires a real manifest_url, `preview`
--     forbids one. This is why every seeded launch row below is `preview`: no
--     first-party plugin artifact is published yet, and marking one `published`
--     would advertise an install that cannot happen.

create table if not exists public.plugin_registry_entries (
  -- Also the URL segment (/plugins/{id}) and, on install, a directory name —
  -- so the alphabet matches the CLI's validate_plugin_name (no traversal, no
  -- separators, no leading dot).
  id text primary key check (id ~ '^[a-z0-9][a-z0-9._-]{0,127}$'),
  name text not null check (length(name) between 1 and 200),
  -- Strict major.minor.patch: a registry that accepts 'latest' cannot order
  -- its own history.
  version text not null check (version ~ '^[0-9]+\.[0-9]+\.[0-9]+([-+][0-9A-Za-z.-]+)*$'),
  description text not null default '',
  category text not null default '',

  publisher_id text not null check (length(publisher_id) between 1 and 128),
  publisher_name text not null check (length(publisher_name) between 1 and 200),
  publisher_kind text not null default 'first-party'
    check (publisher_kind in ('first-party', 'third-party')),
  publisher_url text,

  source text not null check (source in ('builtin', 'marketplace', 'custom')),
  status text not null check (status in ('preview', 'published', 'deprecated')),

  -- Contract array fields, stored verbatim so the service maps 1:1.
  declared_skills jsonb not null default '[]'::jsonb
    check (jsonb_typeof(declared_skills) = 'array'),
  required_connectors jsonb not null default '[]'::jsonb
    check (jsonb_typeof(required_connectors) = 'array'),
  capabilities jsonb not null default '[]'::jsonb
    check (jsonb_typeof(capabilities) = 'array'),
  permissions jsonb not null default '[]'::jsonb
    check (jsonb_typeof(permissions) = 'array'),
  -- Newest-first PluginVersionRef[]; empty until a version is really released.
  versions jsonb not null default '[]'::jsonb
    check (jsonb_typeof(versions) = 'array'),

  -- The PluginManifest artifact, when the registry stores one. NULL for
  -- preview entries: they have no manifest, and synthesizing one would invent
  -- the pack's contents.
  manifest jsonb check (manifest is null or jsonb_typeof(manifest) = 'object'),
  manifest_url text,
  -- Lowercase hex SHA-256 of the artifact at manifest_url. The CLI resolver
  -- compares it after download when present.
  sha256 text check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  signature text,
  signature_algorithm text,
  homepage_url text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint plugin_registry_entries_first_party_only
    check (publisher_kind = 'first-party'),
  constraint plugin_registry_entries_unsigned_until_policy
    check (signature is null and signature_algorithm is null),
  constraint plugin_registry_entries_published_needs_artifact
    check (status <> 'published' or manifest_url is not null),
  constraint plugin_registry_entries_preview_has_no_artifact
    check (status <> 'preview' or (manifest_url is null and sha256 is null))
);

-- Catalogue list view: grouped by category, stable order inside it.
create index if not exists idx_plugin_registry_entries_category
  on public.plugin_registry_entries (category, name);

-- Availability filter (`?status=published`) on the public list endpoint.
create index if not exists idx_plugin_registry_entries_status
  on public.plugin_registry_entries (status, name);

-- Catalogue rows are world-readable: the marketplace is a public page and the
-- CLI resolves against it unauthenticated. RLS is enabled (not FORCEd) so the
-- service-role connection that owns the table keeps its write path, while the
-- non-privileged app_rls role gets SELECT and nothing else — there is
-- deliberately no insert/update/delete grant or policy for app_rls, so a
-- signed-in user session can never mutate the catalogue.
grant select on public.plugin_registry_entries to app_rls;

alter table public.plugin_registry_entries enable row level security;

drop policy if exists plugin_registry_entries_public_read on public.plugin_registry_entries;
create policy plugin_registry_entries_public_read
  on public.plugin_registry_entries for select to app_rls
  using (true);

comment on table public.plugin_registry_entries is
  'Hosted plugin registry: the PluginRegistryEntry contract, world-readable, mutated only by the service role. First-party only at launch (see plugin_registry_entries_first_party_only).';

comment on column public.plugin_registry_entries.status is
  'preview = declared but not distributable (no artifact); published = manifest_url resolves; deprecated = do not install.';

comment on column public.plugin_registry_entries.signature is
  'Reserved for the pending signing policy. A CHECK keeps it NULL until a verifier exists, so a null signature always means unsigned and never means unverified-but-trusted.';

-- ---------------------------------------------------------------------------
-- Seed: the first-party packs the fixture already described.
--
-- Every row is `preview` because no plugin artifact exists in the repo or on a
-- CDN today (there is no .agiworkforce-plugin/plugin.json anywhere to publish).
-- declared_skills / required_connectors are the pack's DECLARED contents, and
-- required_connectors uses ids that really exist in the connector catalogue
-- (apps/web/features/connectors/data/connectors.ts). versions is empty: nothing
-- has been released, so there is no release history to show.
--
-- `on conflict do nothing` keeps the migration replay-safe and never overwrites
-- an entry that was corrected in the hosted database after deploy.
-- ---------------------------------------------------------------------------

insert into public.plugin_registry_entries (
  id, name, version, description, category,
  publisher_id, publisher_name, publisher_kind,
  source, status, declared_skills, required_connectors, capabilities
) values
  (
    'github-automation',
    'GitHub Automation',
    '1.0.0',
    'Automate pull request reviews, issue triage, and CI/CD status checks directly from your chat interface.',
    'Developer',
    'agi', 'AGI', 'first-party',
    'builtin', 'preview',
    '["Code Review", "Issue Summarizer", "PR Drafter"]'::jsonb,
    '["github"]'::jsonb,
    '["connectors", "network"]'::jsonb
  ),
  (
    'calendar-assistant',
    'Calendar Assistant',
    '1.2.0',
    'Smart scheduling, meeting preparation summaries, and follow-up action item extraction from your calendar events.',
    'Productivity',
    'agi', 'AGI', 'first-party',
    'builtin', 'preview',
    '["Meeting Summarizer", "Action Item Extractor", "Scheduler"]'::jsonb,
    '["gmail", "google-calendar"]'::jsonb,
    '["connectors", "network"]'::jsonb
  ),
  (
    'research-pack',
    'Research Pack',
    '0.9.1',
    'Deep web research with source citation, structured literature review, and fact-check verification against live sources.',
    'Research',
    'agi', 'AGI', 'first-party',
    'marketplace', 'preview',
    '["Web Researcher", "Citation Formatter", "Fact Checker"]'::jsonb,
    '[]'::jsonb,
    '["network"]'::jsonb
  ),
  (
    'crm-sync',
    'CRM Sync',
    '1.1.0',
    'Summarize sales calls, auto-update CRM records, draft follow-up emails, and surface deal insights.',
    'Sales',
    'agi', 'AGI', 'first-party',
    'marketplace', 'preview',
    '["Call Summarizer", "Email Drafter", "Deal Analyzer"]'::jsonb,
    '["salesforce", "hubspot", "gmail"]'::jsonb,
    '["connectors", "network"]'::jsonb
  )
on conflict (id) do nothing;
