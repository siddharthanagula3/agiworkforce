/**
 * Plugin Registry Types
 *
 * The shared shape of the hosted plugin registry (CAP-046 slice 1). Three
 * surfaces read it and they must agree byte-for-byte:
 *
 *   - `apps/web/lib/services/plugin-registry-service.ts` maps
 *     `public.plugin_registry_entries` rows (db/neon/0096) onto these types.
 *   - `GET /api/plugins` and `GET /api/plugins/[id]` serve them verbatim.
 *   - `apps/cli/src/features/plugins/registry.rs` deserializes the same JSON
 *     and hands {@link PluginManifest} to the existing manifest loader, whose
 *     serde shape (camelCase, `mcpServers`, tolerant `transport`/`url` fields)
 *     this module mirrors deliberately.
 *
 * LAUNCH SCOPE: first-party only. Third-party submission and manifest signing
 * are pending founder decisions, so {@link PluginPublisher.kind} already models
 * `third-party` and {@link PluginIntegrity} already carries the signature
 * fields — both stay unpopulated until those decisions land. Adding them later
 * is a value change, not a breaking contract change.
 *
 * HONESTY: nothing here models a download count, a rating, or an install total.
 * The registry has never observed one, and a nullable field invites a
 * fabricated value. {@link PluginRegistryEntry.status} plus
 * {@link PluginRegistryEntry.distribution} are the only availability claims,
 * and `distribution === null` means "declared, not distributable" — the state
 * every launch row is actually in.
 *
 * @module plugins
 * @packageDocumentation
 */

// ============================================================================
// Publisher
// ============================================================================

/** Who stands behind a registry entry. */
export type PluginPublisherKind = 'first-party' | 'third-party';

/** Every valid {@link PluginPublisherKind}. */
export const PLUGIN_PUBLISHER_KINDS: readonly PluginPublisherKind[] = [
  'first-party',
  'third-party',
] as const;

/**
 * The publisher of a registry entry.
 *
 * Only `first-party` entries exist at launch. `third-party` is reserved for the
 * submission flow and is rejected by the write path until the review/signing
 * policy is decided.
 */
export interface PluginPublisher {
  /** Stable publisher slug (e.g. `"agi"`). */
  id: string;
  /** Human-readable publisher name shown in UI. */
  name: string;
  /** Trust origin of the entry. */
  kind: PluginPublisherKind;
  /** Publisher homepage, when one exists. */
  url?: string | null;
}

// ============================================================================
// Lifecycle
// ============================================================================

/**
 * Availability of a registry entry.
 *
 * - `preview`     — the pack is declared (name, contents, required connectors)
 *                   but nothing is distributable yet: {@link PluginRegistryEntry.distribution}
 *                   is null and installing it is impossible, not merely gated.
 * - `published`   — a real manifest artifact is resolvable; `distribution` is
 *                   non-null and carries the URL the CLI fetches.
 * - `deprecated`  — was published, should no longer be installed. Existing
 *                   installs keep working; the entry stays readable so a
 *                   resolver can explain why it stopped.
 */
export type PluginRegistryStatus = 'preview' | 'published' | 'deprecated';

/** Every valid {@link PluginRegistryStatus}. */
export const PLUGIN_REGISTRY_STATUSES: readonly PluginRegistryStatus[] = [
  'preview',
  'published',
  'deprecated',
] as const;

/** Runtime guard for an untrusted status value (DB row, API body, CLI fetch). */
export function isPluginRegistryStatus(value: unknown): value is PluginRegistryStatus {
  return (
    typeof value === 'string' && (PLUGIN_REGISTRY_STATUSES as readonly string[]).includes(value)
  );
}

/** Where a plugin came from, as the CLI/desktop plugin lists already label it. */
export type PluginSourceKind = 'builtin' | 'marketplace' | 'custom';

/** Every valid {@link PluginSourceKind}. */
export const PLUGIN_SOURCE_KINDS: readonly PluginSourceKind[] = [
  'builtin',
  'marketplace',
  'custom',
] as const;

/** Runtime guard for an untrusted source value. */
export function isPluginSourceKind(value: unknown): value is PluginSourceKind {
  return typeof value === 'string' && (PLUGIN_SOURCE_KINDS as readonly string[]).includes(value);
}

// ============================================================================
// Manifest
// ============================================================================

/**
 * MCP transports the CLI plugin loader can actually run today
 * (`PluginsManager::mcp_configs` branches on exactly these three).
 */
export type PluginMcpTransport = 'stdio' | 'http' | 'sse';

/** Every valid {@link PluginMcpTransport}. */
export const PLUGIN_MCP_TRANSPORTS: readonly PluginMcpTransport[] = [
  'stdio',
  'http',
  'sse',
] as const;

/** Runtime guard for an untrusted transport value. */
export function isPluginMcpTransport(value: unknown): value is PluginMcpTransport {
  return typeof value === 'string' && (PLUGIN_MCP_TRANSPORTS as readonly string[]).includes(value);
}

/**
 * One MCP server entry inside a plugin manifest.
 *
 * Field names match the CLI's `McpServerConfig` (`command`/`args`/`env` plus
 * the `transport`/`url`/`headers` passthrough it already tolerates), so a
 * registry-served manifest loads without a translation layer.
 */
export interface PluginManifestMcpServer {
  /** Transport. Absent means stdio, matching the CLI's default branch. */
  transport?: PluginMcpTransport;
  /** Executable for stdio transports. */
  command?: string;
  /** Arguments for stdio transports. */
  args?: string[];
  /** Environment for stdio transports. */
  env?: Record<string, string>;
  /** Endpoint for `http`/`sse` transports. */
  url?: string;
  /** Static headers for `http`/`sse` transports. */
  headers?: Record<string, string>;
}

/**
 * The manifest a plugin ships (`.agiworkforce-plugin/plugin.json`), as the
 * registry serves it.
 *
 * Every field is optional except `name`, because the CLI loader treats them all
 * as optional and a stricter contract here would reject manifests that already
 * install correctly.
 */
export interface PluginManifest {
  /** Plugin name. Addressable as `name` or `name@marketplace`. */
  name: string;
  /** Semantic version of this manifest. */
  version?: string;
  /** One-line description. */
  description?: string;
  /** Slash-command markdown paths, relative to the plugin root. */
  commands?: string[];
  /** Sub-agent markdown paths, relative to the plugin root. */
  agents?: string[];
  /** Skill file/directory paths, relative to the plugin root. */
  skills?: string[];
  /** MCP servers the plugin contributes. */
  mcpServers?: Record<string, PluginManifestMcpServer>;
  /** Connector/app ids the plugin declares (legacy `.app.json` field). */
  apps?: string[];
  /** Cross-plugin dependencies: `"name"` or `"name@marketplace"`. */
  dependencies?: string[];
}

// ============================================================================
// Capabilities and permissions
// ============================================================================

/**
 * A capability a plugin declares it needs.
 *
 * These are declarations for display and review, NOT an enforcement mechanism:
 * nothing in the runtime grants or revokes on their basis yet. Presenting them
 * as enforced would be a fake safety badge.
 */
export type PluginCapability =
  | 'filesystem-read'
  | 'filesystem-write'
  | 'network'
  | 'shell'
  | 'mcp'
  | 'connectors';

/** Every valid {@link PluginCapability}. */
export const PLUGIN_CAPABILITIES: readonly PluginCapability[] = [
  'filesystem-read',
  'filesystem-write',
  'network',
  'shell',
  'mcp',
  'connectors',
] as const;

/** Runtime guard for an untrusted capability value. */
export function isPluginCapability(value: unknown): value is PluginCapability {
  return typeof value === 'string' && (PLUGIN_CAPABILITIES as readonly string[]).includes(value);
}

// ============================================================================
// Versions and integrity
// ============================================================================

/**
 * One released version of a plugin.
 *
 * `sha256` is the digest of the manifest artifact at `manifestUrl`; a resolver
 * that downloads the manifest MUST compare it when present. Both are null for
 * `preview` entries, which have no artifact at all.
 */
export interface PluginVersionRef {
  /** Semantic version string. */
  version: string;
  /** ISO 8601 release timestamp. */
  releasedAt: string;
  /** Absolute URL of the manifest artifact, or null when not distributable. */
  manifestUrl?: string | null;
  /** Lowercase hex SHA-256 of the manifest artifact, or null. */
  sha256?: string | null;
  /** Short release note. */
  notes?: string | null;
}

/**
 * Supply-chain claims about the current version.
 *
 * `signature`/`signatureAlgorithm` exist so a signing policy can populate them
 * without a breaking change. They are ALWAYS null today: no signing key, no
 * review process, no verification code. A consumer must treat a null signature
 * as "unsigned", never as "verified".
 */
export interface PluginIntegrity {
  /** Lowercase hex SHA-256 of the current manifest artifact, or null. */
  sha256: string | null;
  /** Detached signature over the artifact. Unpopulated pending signing policy. */
  signature: string | null;
  /** Signature algorithm identifier. Unpopulated pending signing policy. */
  signatureAlgorithm: string | null;
}

/**
 * How the current version is fetched.
 *
 * `null` on a {@link PluginRegistryEntry} means the entry is not distributable —
 * the honest state of every launch row.
 */
export interface PluginDistribution {
  /** Absolute URL of the manifest artifact. */
  manifestUrl: string;
  /** Digest of the artifact at {@link manifestUrl}, when published. */
  sha256: string | null;
}

// ============================================================================
// Registry entry
// ============================================================================

/**
 * One row of the hosted plugin registry.
 *
 * This is the exact JSON `GET /api/plugins/[id]` returns as `entry`, and the
 * exact shape `apps/web/features/plugins` renders.
 */
export interface PluginRegistryEntry {
  /** Stable registry id, also the URL segment (`/plugins/{id}`). */
  id: string;
  /** Display name. */
  name: string;
  /** Current semantic version. */
  version: string;
  /** One-paragraph description. */
  description: string;
  /** Catalogue category (e.g. `"Developer"`). */
  category: string;
  /** Publisher. First-party only at launch. */
  publisher: PluginPublisher;
  /** Provenance label. */
  source: PluginSourceKind;
  /** Availability. See {@link PluginRegistryStatus}. */
  status: PluginRegistryStatus;
  /**
   * Whether Managed Cloud can install this first-party pack from its embedded
   * registry manifest. This is independent of `distribution`: CLI/Desktop
   * installation still requires a downloadable, integrity-pinned artifact.
   */
  webInstallable: boolean;
  /** Skill names the pack declares it bundles. */
  declaredSkills: string[];
  /** Connector ids the pack requires (ids from the connector catalogue). */
  requiredConnectors: string[];
  /** Capabilities the pack declares. Declarative only — not enforced. */
  capabilities: PluginCapability[];
  /**
   * Free-form permission strings the pack declares (e.g. `"repo:read"`).
   * Displayed verbatim; no runtime meaning yet.
   */
  permissions: string[];
  /** Newest-first version history. Empty until a version is actually released. */
  versions: PluginVersionRef[];
  /** Fetch information, or null when nothing is distributable. */
  distribution: PluginDistribution | null;
  /** Supply-chain claims for the current version. */
  integrity: PluginIntegrity;
  /** Optional homepage / documentation URL. */
  homepageUrl?: string | null;
  /** ISO 8601 first-published timestamp. */
  createdAt: string;
  /** ISO 8601 last-modified timestamp. */
  updatedAt: string;
}

/**
 * True when a client can actually resolve and fetch this entry.
 *
 * Derived rather than stored so no row can claim installability while carrying
 * no artifact. A `deprecated` entry is deliberately not installable.
 */
export function isPluginEntryInstallable(entry: PluginRegistryEntry): boolean {
  return entry.status === 'published' && entry.distribution !== null;
}

/** True when the authenticated Web runtime can install an embedded pack. */
export function isPluginEntryWebInstallable(entry: PluginRegistryEntry): boolean {
  return entry.status === 'published' && entry.webInstallable;
}

/** One user-owned Managed Cloud plugin installation. */
export interface PluginInstallation {
  pluginId: string;
  installedVersion: string;
  enabled: boolean;
  installedAt: string;
  updatedAt: string;
}

/** Authenticated response from `/api/plugins/installations`. */
export interface PluginInstallationsResponse {
  installations: PluginInstallation[];
}

/** Response body of `GET /api/plugins`. */
export interface PluginRegistryListResponse {
  entries: PluginRegistryEntry[];
  /** Total entries matching the filter, before `limit` was applied. */
  total: number;
}

/** Response body of `GET /api/plugins/[id]`. */
export interface PluginRegistryEntryResponse {
  entry: PluginRegistryEntry;
  /**
   * The manifest, when the registry stores one. `null` for `preview` entries:
   * they have no manifest, and synthesizing one would invent contents.
   */
  manifest: PluginManifest | null;
}

// ============================================================================
// Runtime validation
// ============================================================================

/** Lowercase hex SHA-256, exactly 64 characters. */
const SHA256_RE = /^[0-9a-f]{64}$/;

/** Runtime guard for a lowercase hex SHA-256 digest. */
export function isPluginSha256(value: unknown): value is string {
  return typeof value === 'string' && SHA256_RE.test(value);
}

/**
 * Semantic version, `major.minor.patch` with optional prerelease/build.
 * Deliberately strict: a registry that accepts `"latest"` as a version cannot
 * order its own history.
 */
const SEMVER_RE =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

/** Runtime guard for a strict semantic version string. */
export function isPluginSemver(value: unknown): value is string {
  return typeof value === 'string' && SEMVER_RE.test(value);
}

/**
 * Plugin ids are URL segments and directory names on install, so they are
 * restricted to the same alphabet the CLI's `validate_plugin_name` accepts,
 * minus the leading-dot cases it rejects.
 */
const PLUGIN_ID_RE = /^[a-z0-9][a-z0-9._-]{0,127}$/;

/** Runtime guard for a registry plugin id. */
export function isPluginId(value: unknown): value is string {
  return typeof value === 'string' && PLUGIN_ID_RE.test(value);
}

/**
 * Runtime guard for an untrusted manifest (registry fetch, uploaded artifact).
 *
 * Validates only what the loader relies on; unknown keys are allowed because
 * the CLI preserves them via serde flatten and rejecting them would break
 * Claude/Codex-format manifests that already load.
 */
export function isPluginManifest(value: unknown): value is PluginManifest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const manifest = value as Record<string, unknown>;

  if (typeof manifest['name'] !== 'string' || manifest['name'].trim().length === 0) return false;
  if (manifest['version'] !== undefined && !isPluginSemver(manifest['version'])) return false;
  if (manifest['description'] !== undefined && typeof manifest['description'] !== 'string') {
    return false;
  }

  for (const key of ['commands', 'agents', 'skills', 'apps', 'dependencies'] as const) {
    const field = manifest[key];
    if (field === undefined) continue;
    if (!Array.isArray(field) || !field.every((item) => typeof item === 'string')) return false;
  }

  const servers = manifest['mcpServers'];
  if (servers !== undefined) {
    if (!servers || typeof servers !== 'object' || Array.isArray(servers)) return false;
    for (const server of Object.values(servers as Record<string, unknown>)) {
      if (!server || typeof server !== 'object' || Array.isArray(server)) return false;
      const transport = (server as Record<string, unknown>)['transport'];
      if (transport !== undefined && !isPluginMcpTransport(transport)) return false;
    }
  }

  return true;
}
