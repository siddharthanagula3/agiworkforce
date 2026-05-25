/**
 * Project row mapping.
 *
 * Maps a `public.user_projects` row (snake_case Postgres) into the canonical
 * `ProjectRecord` shape from `@agiworkforce/types`, while tolerating
 * pre-migration column states. The round-10 schema migration
 * (`20260521120000_project_schema_round_10.sql`) adds:
 *   - default_privacy_mode (NOT NULL default 'local')
 *   - default_provider_mode (NOT NULL default 'Local')
 *   - allowed_surfaces (NOT NULL default ['web','desktop','mobile'])
 *   - icon_emoji, accent_color, imported_from, organization_id,
 *     default_model_id, last_used_at (all nullable)
 *
 * Until that migration applies, the columns are absent and the mapper
 * defaults them. Once applied, the mapper passes them through. Either
 * way callers get the same canonical shape.
 *
 * The legacy `color` field (free-form CSS) is preserved separately from
 * the canonical `accentColor` enum — they are different concepts and
 * existing clients depend on `color`.
 */

import {
  DEVELOPER_SESSION_SURFACES,
  PRIVACY_MODES,
  PROVIDER_MODES,
  SYNCED_APP_SURFACES,
  type PrivacyMode,
  type ProviderMode,
  type ProjectAccentColor,
  type ProjectImportSource,
  type ProjectKnowledgeFile,
  type SourceSurface,
} from '@agiworkforce/types';

const ACCENT_COLORS: readonly ProjectAccentColor[] = [
  'emerald',
  'sky',
  'amber',
  'rose',
  'violet',
  'zinc',
];
const IMPORT_SOURCES: readonly ProjectImportSource[] = ['claude', 'openai', 'manual'];
const SURFACES: readonly SourceSurface[] = [...SYNCED_APP_SURFACES, ...DEVELOPER_SESSION_SURFACES];

const DEFAULT_ALLOWED_SURFACES: SourceSurface[] = [...SYNCED_APP_SURFACES];

export interface MappedProject {
  id: string;
  ownerUserId: string;
  organizationId: string | null;
  name: string;
  description: string | null;
  instructions: string | null;
  /** Legacy CSS color, preserved for backward-compat. */
  color: string | null;
  isArchived: boolean;
  metadata: Record<string, unknown> | null;
  defaultPrivacyMode: PrivacyMode;
  defaultProviderMode: ProviderMode;
  allowedSurfaces: SourceSurface[];
  defaultModelId: string | null;
  lastUsedAt: string | null;
  iconEmoji: string | null;
  accentColor: ProjectAccentColor | null;
  importedFrom: ProjectImportSource | null;
  createdAt: string;
  updatedAt: string;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function asBool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function asPrivacyMode(value: unknown): PrivacyMode {
  return typeof value === 'string' && (PRIVACY_MODES as readonly string[]).includes(value)
    ? (value as PrivacyMode)
    : 'local';
}

function asProviderMode(value: unknown): ProviderMode {
  return typeof value === 'string' && (PROVIDER_MODES as readonly string[]).includes(value)
    ? (value as ProviderMode)
    : 'Local';
}

function asAccentColor(value: unknown): ProjectAccentColor | null {
  return typeof value === 'string' && (ACCENT_COLORS as readonly string[]).includes(value)
    ? (value as ProjectAccentColor)
    : null;
}

function asImportSource(value: unknown): ProjectImportSource | null {
  return typeof value === 'string' && (IMPORT_SOURCES as readonly string[]).includes(value)
    ? (value as ProjectImportSource)
    : null;
}

function asAllowedSurfaces(value: unknown): SourceSurface[] {
  if (!Array.isArray(value)) return [...DEFAULT_ALLOWED_SURFACES];
  const filtered = value.filter(
    (s): s is SourceSurface => typeof s === 'string' && (SURFACES as readonly string[]).includes(s),
  );
  return filtered.length > 0 ? filtered : [...DEFAULT_ALLOWED_SURFACES];
}

function asMetadata(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

export function mapKnowledgeFileRow(row: Record<string, unknown>): ProjectKnowledgeFile {
  return {
    id: String(row['id'] ?? ''),
    projectId: String(row['project_id'] ?? ''),
    fileName: String(row['file_name'] ?? ''),
    mimeType: String(row['mime_type'] ?? ''),
    byteCount: typeof row['byte_count'] === 'number' ? row['byte_count'] : 0,
    checksumSha256: String(row['checksum_sha256'] ?? ''),
    summary: asString(row['summary']),
    sourceSurface:
      typeof row['source_surface'] === 'string' ? (row['source_surface'] as SourceSurface) : 'web',
    addedByUserId: asString(row['added_by_user_id']),
    addedAt: String(row['added_at'] ?? ''),
    retentionExpiresAt: asString(row['retention_expires_at']),
    deletedAt: asString(row['deleted_at']),
    storageUri: String(row['storage_uri'] ?? ''),
  };
}

/**
 * Map a raw `user_projects` row from Neon into the canonical
 * project shape. Tolerant of missing columns when the round-10
 * migration hasn't been applied yet — defaults are derived from the
 * canonical `PrivacyMode`/`ProviderMode`/`SourceSurface` types.
 */
export function mapProjectRow(row: Record<string, unknown>): MappedProject {
  return {
    id: String(row['id'] ?? ''),
    ownerUserId: String(row['user_id'] ?? ''),
    organizationId: asString(row['organization_id']),
    name: String(row['name'] ?? ''),
    description: asString(row['description']),
    instructions: asString(row['instructions']),
    color: asString(row['color']),
    isArchived: asBool(row['is_archived'], false),
    metadata: asMetadata(row['metadata']),
    defaultPrivacyMode: asPrivacyMode(row['default_privacy_mode']),
    defaultProviderMode: asProviderMode(row['default_provider_mode']),
    allowedSurfaces: asAllowedSurfaces(row['allowed_surfaces']),
    defaultModelId: asString(row['default_model_id']),
    lastUsedAt: asString(row['last_used_at']),
    iconEmoji: asString(row['icon_emoji']),
    accentColor: asAccentColor(row['accent_color']),
    importedFrom: asImportSource(row['imported_from']),
    createdAt: String(row['created_at'] ?? ''),
    updatedAt: String(row['updated_at'] ?? ''),
  };
}
