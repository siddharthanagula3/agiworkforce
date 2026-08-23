
import {
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
const SURFACES: readonly SourceSurface[] = [...SYNCED_APP_SURFACES];

const DEFAULT_ALLOWED_SURFACES: SourceSurface[] = [...SYNCED_APP_SURFACES];

export interface MappedProject {
  id: string;
  ownerUserId: string;
  organizationId: string | null;
  name: string;
  description: string | null;
  instructions: string | null;
  color: string | null;
  isArchived: boolean;
  usesGlobalMemory: boolean;
  metadata: Record<string, unknown> | null;
  defaultPrivacyMode: PrivacyMode;
  defaultProviderMode: ProviderMode;
  allowedSurfaces: SourceSurface[];
  defaultModelId: string | null;
  conversationCount: number;
  lastUsedAt: string | null;
  iconEmoji: string | null;
  accentColor: ProjectAccentColor | null;
  importedFrom: ProjectImportSource | null;
  createdAt: string;
  updatedAt: string;
  isOrgShared: boolean;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function asBool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function asPrivacyMode(_value: unknown): PrivacyMode {
  return 'managed';
}

function asProviderMode(value: unknown): ProviderMode {
  return value === 'ManagedNative' ? 'ManagedNative' : 'ManagedGateway';
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
    // Absent before 0135 and for any row the select does not carry it on:
    // default true, which is the pre-0135 behaviour.
    usesGlobalMemory: asBool(row['uses_global_memory'], true),
    metadata: asMetadata(row['metadata']),
    defaultPrivacyMode: asPrivacyMode(row['default_privacy_mode']),
    defaultProviderMode: asProviderMode(row['default_provider_mode']),
    allowedSurfaces: asAllowedSurfaces(row['allowed_surfaces']),
    defaultModelId: asString(row['default_model_id']),
    conversationCount:
      typeof row['conversation_count'] === 'number' ? row['conversation_count'] : 0,
    lastUsedAt: asString(row['last_used_at']),
    iconEmoji: asString(row['icon_emoji']),
    accentColor: asAccentColor(row['accent_color']),
    importedFrom: asImportSource(row['imported_from']),
    createdAt: String(row['created_at'] ?? ''),
    updatedAt: String(row['updated_at'] ?? ''),
    isOrgShared: asBool(row['is_org_shared'], false),
  };
}
