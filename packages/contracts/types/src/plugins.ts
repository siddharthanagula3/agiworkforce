export type PluginPublisherKind = 'first-party' | 'third-party';

/** Every valid {@link PluginPublisherKind}. */
export const PLUGIN_PUBLISHER_KINDS: readonly PluginPublisherKind[] = [
  'first-party',
  'third-party',
] as const;

export interface PluginPublisher {
  id: string;
  name: string;
  kind: PluginPublisherKind;
  url?: string | null;
}

export type PluginRegistryStatus = 'preview' | 'published' | 'deprecated';

/** Every valid {@link PluginRegistryStatus}. */
export const PLUGIN_REGISTRY_STATUSES: readonly PluginRegistryStatus[] = [
  'preview',
  'published',
  'deprecated',
] as const;

export function isPluginRegistryStatus(value: unknown): value is PluginRegistryStatus {
  return (
    typeof value === 'string' && (PLUGIN_REGISTRY_STATUSES as readonly string[]).includes(value)
  );
}

export type PluginSourceKind = 'builtin' | 'marketplace' | 'custom';

/** Every valid {@link PluginSourceKind}. */
export const PLUGIN_SOURCE_KINDS: readonly PluginSourceKind[] = [
  'builtin',
  'marketplace',
  'custom',
] as const;

export function isPluginSourceKind(value: unknown): value is PluginSourceKind {
  return typeof value === 'string' && (PLUGIN_SOURCE_KINDS as readonly string[]).includes(value);
}

export type PluginMcpTransport = 'stdio' | 'http' | 'sse';

/** Every valid {@link PluginMcpTransport}. */
export const PLUGIN_MCP_TRANSPORTS: readonly PluginMcpTransport[] = [
  'stdio',
  'http',
  'sse',
] as const;

export function isPluginMcpTransport(value: unknown): value is PluginMcpTransport {
  return typeof value === 'string' && (PLUGIN_MCP_TRANSPORTS as readonly string[]).includes(value);
}

export interface PluginManifestMcpServer {
  transport?: PluginMcpTransport;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
}

export interface PluginManifest {
  name: string;
  version?: string;
  description?: string;
  commands?: string[];
  agents?: string[];
  skills?: string[];
  mcpServers?: Record<string, PluginManifestMcpServer>;
  apps?: string[];
  dependencies?: string[];
}

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

export function isPluginCapability(value: unknown): value is PluginCapability {
  return typeof value === 'string' && (PLUGIN_CAPABILITIES as readonly string[]).includes(value);
}

export interface PluginVersionRef {
  version: string;
  releasedAt: string;
  manifestUrl?: string | null;
  sha256?: string | null;
  notes?: string | null;
}

export interface PluginIntegrity {
  sha256: string | null;
  signature: string | null;
  signatureAlgorithm: string | null;
}

export interface PluginDistribution {
  manifestUrl: string;
  /** Digest of the artifact at {@link manifestUrl}, when published. */
  sha256: string | null;
}

export interface PluginRegistryEntry {
  id: string;
  name: string;
  version: string;
  description: string;
  category: string;
  publisher: PluginPublisher;
  source: PluginSourceKind;
  /** Availability. See {@link PluginRegistryStatus}. */
  status: PluginRegistryStatus;
  webInstallable: boolean;
  declaredSkills: string[];
  /**
   * True when installing this entry is what makes at least one of
   * {@link declaredSkills} reachable. False means every declared skill is
   * already available without installing anything. Absent only where the
   * live Skill catalog was not consulted; every route that returns this type
   * computes it. See the module HONESTY note.
   */
  skillsRequireInstall?: boolean;
  requiredConnectors: string[];
  capabilities: PluginCapability[];
  permissions: string[];
  /** "Try asking" directory copy. Display-only strings, never sent to a model. */
  examplePrompts: string[];
  versions: PluginVersionRef[];
  distribution: PluginDistribution | null;
  integrity: PluginIntegrity;
  homepageUrl?: string | null;
  /** Real observed install count. Absent, not zero, where not computed. See module doc. */
  installCount?: number;
  createdAt: string;
  updatedAt: string;
}

export function isPluginEntryInstallable(entry: PluginRegistryEntry): boolean {
  return entry.status === 'published' && entry.distribution !== null;
}

export function isPluginEntryWebInstallable(entry: PluginRegistryEntry): boolean {
  return entry.status === 'published' && entry.webInstallable;
}

export interface PluginInstallation {
  pluginId: string;
  installedVersion: string;
  enabled: boolean;
  installedAt: string;
  updatedAt: string;
}

export interface PluginInstallationsResponse {
  installations: PluginInstallation[];
}

export interface PluginRegistryListResponse {
  entries: PluginRegistryEntry[];
  total: number;
}

export interface PluginRegistryEntryResponse {
  entry: PluginRegistryEntry;
  manifest: PluginManifest | null;
}

const SHA256_RE = /^[0-9a-f]{64}$/;

export function isPluginSha256(value: unknown): value is string {
  return typeof value === 'string' && SHA256_RE.test(value);
}

const SEMVER_RE =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

export function isPluginSemver(value: unknown): value is string {
  return typeof value === 'string' && SEMVER_RE.test(value);
}

const PLUGIN_ID_RE = /^[a-z0-9][a-z0-9._-]{0,127}$/;

export function isPluginId(value: unknown): value is string {
  return typeof value === 'string' && PLUGIN_ID_RE.test(value);
}

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
