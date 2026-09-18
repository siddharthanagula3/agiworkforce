/**
 * @file file-reference.ts
 * @module @agiworkforce/types/file-reference
 *
 * # One way to name a file, and one way to name something inside a connector
 *
 * Four surfaces described the same bytes four ways. `GeneratedFileWire` in
 * cloud-contracts carried `file_name`/`mime_type`/`byte_count`/`uri`,
 * `ManagedCloudChatAttachment` carried `name`/`mimeType`/`byteCount`/`url`,
 * the artifact index carried an id and a `visibility` typed as a free string,
 * and `project_knowledge_files` carried `source_surface` as free text. Nothing
 * said where the bytes live, whether they had been parsed, or who may read
 * them, so every consumer guessed from the shape it happened to receive.
 *
 * `FileReference` is that description, once. It is deliberately metadata only:
 * it names bytes and where to fetch them, never the bytes themselves.
 *
 * `ExternalResourceRef` is the same idea for something the platform does not
 * store: a row in a connected Notion database, an issue in a linked GitHub
 * repository. It is a stable address, not a copy, which is what lets a
 * disconnected connector revoke access to everything it lent out.
 */

import type { ResourceVisibility } from './resource-lifecycle';
import type { SourceSurface } from './suite-contracts';

/** How the platform came to hold this file. */
export const FILE_ORIGINS = ['upload', 'generated', 'connector', 'import'] as const;
export type FileOrigin = (typeof FILE_ORIGINS)[number];

/** Where the bytes actually are, which decides who can fetch them. */
export const FILE_STORAGE_TIERS = ['managed_cloud', 'local_device', 'external'] as const;
export type FileStorageTier = (typeof FILE_STORAGE_TIERS)[number];

/**
 * Whether the text behind the bytes is available yet. A consumer that needs
 * text must read this rather than inferring it from a non-empty extract.
 */
export const FILE_PARSE_STATUSES = ['not_applicable', 'pending', 'parsed', 'failed'] as const;
export type FileParseStatus = (typeof FILE_PARSE_STATUSES)[number];

export interface FileReference {
  id: string;
  name: string;
  mediaType: string;
  byteCount: number;
  origin: FileOrigin;
  storage: FileStorageTier;
  /** Absolute or app-relative address the holder fetches the bytes from. */
  uri: string;
  checksumSha256: string | null;
  parseStatus: FileParseStatus;
  visibility: ResourceVisibility;
  /** The surface that produced the file, for provenance. */
  sourceSurface: SourceSurface | null;
  /** Set when the file came from a connector rather than from the account. */
  externalResource: ExternalResourceRef | null;
}

/**
 * A durable address for something living in a connected third-party account.
 * `connectorId` is the installation, so revoking it invalidates every
 * reference that carries it without those references needing to be found.
 */
export interface ExternalResourceRef {
  connectorId: string;
  provider: string;
  resourceType: string;
  resourceId: string;
  uri: string | null;
  label: string | null;
}

export function isFileOrigin(value: unknown): value is FileOrigin {
  return (FILE_ORIGINS as readonly unknown[]).includes(value);
}

export function isFileStorageTier(value: unknown): value is FileStorageTier {
  return (FILE_STORAGE_TIERS as readonly unknown[]).includes(value);
}

export function isFileParseStatus(value: unknown): value is FileParseStatus {
  return (FILE_PARSE_STATUSES as readonly unknown[]).includes(value);
}

export function isExternalResourceRef(value: unknown): value is ExternalResourceRef {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate['connectorId'] === 'string' &&
    typeof candidate['provider'] === 'string' &&
    typeof candidate['resourceType'] === 'string' &&
    typeof candidate['resourceId'] === 'string'
  );
}

/**
 * The stable key two references to the same bytes agree on: the connector's
 * own address when there is one, the checksum when the platform holds the
 * bytes, and the id when neither is known.
 */
export function fileReferenceIdentity(reference: FileReference): string {
  if (reference.externalResource !== null) {
    const external = reference.externalResource;
    return `${external.provider}:${external.resourceType}:${external.resourceId}`;
  }
  return reference.checksumSha256 !== null
    ? `sha256:${reference.checksumSha256}`
    : `file:${reference.id}`;
}

export function isFetchableFileReference(reference: FileReference): boolean {
  return reference.storage !== 'local_device' && reference.uri.length > 0;
}

export interface FileReferenceInput {
  id: string;
  name: string;
  mediaType: string;
  byteCount: number;
  uri: string;
  origin: FileOrigin;
  storage?: FileStorageTier;
  checksumSha256?: string | null;
  parseStatus?: FileParseStatus;
  visibility?: ResourceVisibility;
  sourceSurface?: SourceSurface | null;
  externalResource?: ExternalResourceRef | null;
}

export function createFileReference(input: FileReferenceInput): FileReference {
  return {
    id: input.id,
    name: input.name,
    mediaType: input.mediaType,
    byteCount: Math.max(0, Math.trunc(input.byteCount)),
    origin: input.origin,
    storage: input.storage ?? (input.origin === 'connector' ? 'external' : 'managed_cloud'),
    uri: input.uri,
    checksumSha256: input.checksumSha256 ?? null,
    parseStatus: input.parseStatus ?? 'not_applicable',
    visibility: input.visibility ?? 'private',
    sourceSurface: input.sourceSurface ?? null,
    externalResource: input.externalResource ?? null,
  };
}
