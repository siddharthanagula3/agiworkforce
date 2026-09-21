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

/**
 * The one cap on text read out of a file. Every extractor and every pipeline
 * that truncates reads it from here; a second copy is free to disagree.
 */
export const MAX_FILE_TEXT_CHARS = 200_000;

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

/**
 * Whether retrieval can find this file's text. It is not the parse status: a
 * parsed file whose index entry was dropped on deletion is `not_indexed`.
 */
export const FILE_INDEX_STATUSES = ['not_indexed', 'pending', 'indexed', 'failed'] as const;
export type FileIndexStatus = (typeof FILE_INDEX_STATUSES)[number];

/**
 * The tenant that may read the bytes. A reference naming neither belongs to
 * nobody, which is the only safe reading of an unscoped file.
 */
export interface FileOwnerScope {
  workspaceId: string | null;
  userId: string | null;
}

export const UNOWNED_FILE_SCOPE: FileOwnerScope = { workspaceId: null, userId: null };

/**
 * The three questions a surface must answer before it offers to open a file.
 * One storage tier cannot answer them: a synced file is in both places.
 */
export interface FileAvailability {
  cloudCopy: boolean;
  localCopy: boolean;
  onThisDevice: boolean;
}

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
  indexStatus: FileIndexStatus;
  visibility: ResourceVisibility;
  owner: FileOwnerScope;
  availability: FileAvailability;
  /** ISO 8601, or null when the minting surface was not told. */
  createdAt: string | null;
  /** The surface that produced the file, for provenance. */
  sourceSurface: SourceSurface | null;
  /** Set when the file came from a connector rather than from the account. */
  externalResource: ExternalResourceRef | null;
}

/**
 * Each fact a file reference has to carry, named once, so a consumer and a
 * guard agree on which field answers which question.
 */
export const FILE_REFERENCE_ROLES = {
  fileId: 'id',
  name: 'name',
  mediaType: 'mediaType',
  size: 'byteCount',
  source: 'origin',
  storageBackend: 'storage',
  checksum: 'checksumSha256',
  parsedStatus: 'parseStatus',
  indexStatus: 'indexStatus',
  acl: 'visibility',
  owner: 'owner',
  availability: 'availability',
  created: 'createdAt',
} as const satisfies Readonly<Record<string, keyof FileReference>>;

export type FileReferenceRole = keyof typeof FILE_REFERENCE_ROLES;

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

export function isFileIndexStatus(value: unknown): value is FileIndexStatus {
  return (FILE_INDEX_STATUSES as readonly unknown[]).includes(value);
}

export function resolveFileOwnerScope(
  partial: Partial<FileOwnerScope> | undefined,
): FileOwnerScope {
  return { workspaceId: partial?.workspaceId ?? null, userId: partial?.userId ?? null };
}

export function isOwnedFileReference(reference: FileReference): boolean {
  return reference.owner.workspaceId !== null || reference.owner.userId !== null;
}

/**
 * Whether this reader may resolve the reference. An unowned file resolves for
 * nobody, so a reference that lost its tenant cannot be read back into one.
 */
export function canReadFileReference(
  reference: FileReference,
  reader: Partial<FileOwnerScope>,
): boolean {
  if (!isOwnedFileReference(reference)) return false;
  const { workspaceId, userId } = reference.owner;
  if (workspaceId !== null) return reader.workspaceId === workspaceId;
  return userId !== null && reader.userId === userId;
}

export function resolveFileAvailability(
  storage: FileStorageTier,
  partial: Partial<FileAvailability> | undefined,
): FileAvailability {
  const local = storage === 'local_device';
  return {
    cloudCopy: partial?.cloudCopy ?? storage === 'managed_cloud',
    localCopy: partial?.localCopy ?? local,
    onThisDevice: partial?.onThisDevice ?? local,
  };
}

const IDENTITY_IS_AN_ADDRESS = /^(?:[a-z][a-z0-9+.-]*:\/\/|\/\/|\/)/i;
const IDENTITY_CARRIES_ACCESS = /(?:signature|expires|credential|access[_-]?key|secret)/i;

export class InvalidFileIdentityError extends Error {
  override readonly name = 'InvalidFileIdentityError';
  constructor(readonly reason: string) {
    super(`A file reference id must be a minted identity: ${reason}.`);
  }
}

/**
 * Why this id cannot be an identity, or null when it can be. An address, a
 * signed url or a key grants access; identity has to outlive all three.
 */
export function fileIdentityDefect(id: string, uri: string): string | null {
  if (id.trim().length === 0) return 'it is empty';
  if (IDENTITY_IS_AN_ADDRESS.test(id)) return 'it is an address rather than a name';
  if (id === uri) return 'it repeats the uri, so moving the bytes renames the file';
  if (id.includes('?') || id.includes('&')) return 'it carries query parameters';
  if (IDENTITY_CARRIES_ACCESS.test(id)) return 'it carries an access-granting parameter';
  return null;
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
  indexStatus?: FileIndexStatus;
  visibility?: ResourceVisibility;
  owner?: Partial<FileOwnerScope> | null;
  availability?: Partial<FileAvailability> | null;
  createdAt?: string | null;
  sourceSurface?: SourceSurface | null;
  externalResource?: ExternalResourceRef | null;
}

export function createFileReference(input: FileReferenceInput): FileReference {
  const defect = fileIdentityDefect(input.id, input.uri);
  if (defect !== null) throw new InvalidFileIdentityError(defect);
  const storage = input.storage ?? (input.origin === 'connector' ? 'external' : 'managed_cloud');
  return {
    id: input.id,
    name: input.name,
    mediaType: input.mediaType,
    byteCount: Math.max(0, Math.trunc(input.byteCount)),
    origin: input.origin,
    storage,
    uri: input.uri,
    checksumSha256: input.checksumSha256 ?? null,
    parseStatus: input.parseStatus ?? 'not_applicable',
    indexStatus: input.indexStatus ?? 'not_indexed',
    visibility: input.visibility ?? 'private',
    owner: resolveFileOwnerScope(input.owner ?? undefined),
    availability: resolveFileAvailability(storage, input.availability ?? undefined),
    createdAt: input.createdAt ?? null,
    sourceSurface: input.sourceSurface ?? null,
    externalResource: input.externalResource ?? null,
  };
}
