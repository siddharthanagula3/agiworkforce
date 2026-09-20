/**
 * @file file-model.ts
 * @module @agiworkforce/types/file-model
 *
 * # One File, with a history and a parent
 *
 * `FileReference` says what bytes are and where to fetch them. It deliberately
 * says nothing about time: an edited upload, the export taken from it and the
 * artifact it became were three unrelated references, so "which file did this
 * come from" and "what did it look like before" had no answer on any surface.
 *
 * `ManagedFile` is that same reference plus the two facts a file accumulates:
 * a version, which is the same bytes' place in an append-only chain, and a
 * lineage, which is the other file it was derived from. Both are metadata; the
 * bytes still live wherever the reference says they do.
 */

import {
  createFileReference,
  fileReferenceIdentity,
  FILE_REFERENCE_ROLES,
  type FileAvailability,
  type FileOrigin,
  type FileOwnerScope,
  type FileReference,
  type FileReferenceInput,
} from './file-reference';
import { isTextLikeFileMediaType } from './file-input';
import type { SourceSurface } from './suite-contracts';

/** How a file came to exist from another file. */
export const FILE_DERIVATIONS = ['edit', 'export', 'conversion', 'extraction', 'copy'] as const;
export type FileDerivation = (typeof FILE_DERIVATIONS)[number];

/**
 * Where a file came from. A file with no `derivedFromFileId` is an original:
 * somebody uploaded it or a turn produced it from nothing but a prompt.
 */
export interface FileLineage {
  derivedFromFileId: string | null;
  derivation: FileDerivation | null;
  /** The assistant turn that produced the bytes, null when a person supplied them. */
  generatedByTurnId: string | null;
  uploadedByUserId: string | null;
  conversationId: string | null;
}

export const UNTRACED_FILE_LINEAGE: FileLineage = {
  derivedFromFileId: null,
  derivation: null,
  generatedByTurnId: null,
  uploadedByUserId: null,
  conversationId: null,
};

export interface ManagedFile extends FileReference {
  /** 1 for the first revision. Every write appends, so this only ever grows. */
  version: number;
  /** The revision this one replaced, null for the first. */
  parentVersionId: string | null;
  lineage: FileLineage;
}

export interface ManagedFileInput extends FileReferenceInput {
  version?: number;
  parentVersionId?: string | null;
  lineage?: Partial<FileLineage>;
}

/** Every fact a managed file carries, named once for its consumers and guards. */
export const MANAGED_FILE_ROLES = {
  ...FILE_REFERENCE_ROLES,
  version: 'version',
} as const satisfies Readonly<Record<string, keyof ManagedFile>>;

export type ManagedFileRole = keyof typeof MANAGED_FILE_ROLES;

export function isFileDerivation(value: unknown): value is FileDerivation {
  return (FILE_DERIVATIONS as readonly unknown[]).includes(value);
}

export function resolveFileLineage(partial: Partial<FileLineage> | undefined): FileLineage {
  return {
    derivedFromFileId: partial?.derivedFromFileId ?? null,
    derivation: partial?.derivation ?? null,
    generatedByTurnId: partial?.generatedByTurnId ?? null,
    uploadedByUserId: partial?.uploadedByUserId ?? null,
    conversationId: partial?.conversationId ?? null,
  };
}

export function createManagedFile(input: ManagedFileInput): ManagedFile {
  const reference = createFileReference(input);
  const version = Math.max(1, Math.trunc(input.version ?? 1));
  return {
    ...reference,
    version,
    parentVersionId: input.parentVersionId ?? null,
    lineage: resolveFileLineage(input.lineage),
  };
}

/** Promote a plain reference without inventing history it does not have. */
export function toManagedFile(
  reference: FileReference,
  lineage: Partial<FileLineage> = {},
): ManagedFile {
  return {
    ...reference,
    version: 1,
    parentVersionId: null,
    lineage: resolveFileLineage(lineage),
  };
}

export interface NextFileVersionInput {
  id: string;
  uri: string;
  byteCount?: number;
  checksumSha256?: string | null;
  name?: string;
  mediaType?: string;
  createdAt?: string | null;
}

/**
 * The next revision of the same file. Lineage, owner and visibility carry
 * forward; the parse and index statuses do not, because these are new bytes.
 */
export function nextFileVersion(current: ManagedFile, input: NextFileVersionInput): ManagedFile {
  const mediaType = input.mediaType ?? current.mediaType;
  return {
    ...current,
    id: input.id,
    uri: input.uri,
    name: input.name ?? current.name,
    mediaType,
    byteCount:
      input.byteCount === undefined ? current.byteCount : Math.max(0, Math.trunc(input.byteCount)),
    checksumSha256: input.checksumSha256 === undefined ? null : input.checksumSha256,
    parseStatus: current.parseStatus === 'not_applicable' ? 'not_applicable' : 'pending',
    indexStatus: 'not_indexed',
    createdAt: input.createdAt === undefined ? current.createdAt : input.createdAt,
    version: current.version + 1,
    parentVersionId: current.id,
  };
}

/**
 * A different file produced from this one. It starts its own version chain and
 * stays in the source's tenant: an export of my file is still mine.
 */
export function deriveManagedFile(
  source: ManagedFile,
  input: ManagedFileInput & { derivation: FileDerivation },
): ManagedFile {
  return createManagedFile({
    ...input,
    owner: input.owner ?? source.owner,
    version: 1,
    parentVersionId: null,
    lineage: {
      ...resolveFileLineage(input.lineage),
      derivedFromFileId: source.id,
      derivation: input.derivation,
      conversationId: input.lineage?.conversationId ?? source.lineage.conversationId,
    },
  });
}

export function isDerivedFile(file: ManagedFile): boolean {
  return file.lineage.derivedFromFileId !== null;
}

export function isRevisionOf(candidate: ManagedFile, parent: ManagedFile): boolean {
  return candidate.parentVersionId === parent.id && candidate.version === parent.version + 1;
}

/**
 * The identity two references to the same bytes agree on, qualified by the
 * revision, so version 2 of an edited file is not mistaken for version 1.
 */
export function managedFileIdentity(file: ManagedFile): string {
  return `${fileReferenceIdentity(file)}@v${file.version}`;
}

/** Newest first, which is the order every history list renders in. */
export function sortFileVersions(files: readonly ManagedFile[]): ManagedFile[] {
  return [...files].sort((left, right) => right.version - left.version);
}

export function latestFileVersion(files: readonly ManagedFile[]): ManagedFile | null {
  return sortFileVersions(files)[0] ?? null;
}

/**
 * The document classes the product claims to read, declared once.
 *
 * Admission, extraction routing and the Library filter each decided which
 * extensions counted, so a `.tsv` was admitted by the composer, routed as
 * opaque bytes and then listed as a spreadsheet.
 */
export const DOCUMENT_FAMILIES = ['document', 'structured_data', 'presentation'] as const;
export type DocumentFamily = (typeof DOCUMENT_FAMILIES)[number];

/** The decoder family that reads a class. It is a property of the bytes, not of a surface. */
export const DOCUMENT_EXTRACTORS = ['text', 'office', 'pdf'] as const;
export type DocumentExtractor = (typeof DOCUMENT_EXTRACTORS)[number];

export interface DocumentClass {
  id: string;
  label: string;
  family: DocumentFamily;
  extractor: DocumentExtractor;
  mediaTypes: readonly string[];
  extensions: readonly string[];
}

export const DOCUMENT_CLASSES: readonly DocumentClass[] = [
  {
    id: 'pdf',
    label: 'PDF',
    family: 'document',
    extractor: 'pdf',
    mediaTypes: ['application/pdf'],
    extensions: ['pdf'],
  },
  {
    id: 'docx',
    label: 'DOCX',
    family: 'document',
    extractor: 'office',
    mediaTypes: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    extensions: ['docx'],
  },
  {
    id: 'txt',
    label: 'TXT',
    family: 'document',
    extractor: 'text',
    mediaTypes: ['text/plain'],
    extensions: ['txt', 'text'],
  },
  {
    id: 'markdown',
    label: 'Markdown',
    family: 'document',
    extractor: 'text',
    mediaTypes: ['text/markdown', 'text/x-markdown'],
    extensions: ['md', 'markdown'],
  },
  {
    id: 'html',
    label: 'HTML',
    family: 'document',
    extractor: 'text',
    mediaTypes: ['text/html'],
    extensions: ['html', 'htm'],
  },
  {
    id: 'csv',
    label: 'CSV',
    family: 'structured_data',
    extractor: 'text',
    mediaTypes: ['text/csv', 'application/csv', 'application/x-csv'],
    extensions: ['csv'],
  },
  {
    id: 'tsv',
    label: 'TSV',
    family: 'structured_data',
    extractor: 'text',
    mediaTypes: ['text/tab-separated-values'],
    extensions: ['tsv'],
  },
  {
    id: 'xlsx',
    label: 'XLSX',
    family: 'structured_data',
    extractor: 'office',
    mediaTypes: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    extensions: ['xlsx'],
  },
  {
    id: 'json',
    label: 'JSON',
    family: 'structured_data',
    extractor: 'text',
    mediaTypes: ['application/json', 'text/json'],
    extensions: ['json'],
  },
  {
    id: 'jsonl',
    label: 'JSONL',
    family: 'structured_data',
    extractor: 'text',
    mediaTypes: ['application/jsonl', 'application/x-ndjson'],
    extensions: ['jsonl', 'ndjson'],
  },
  {
    id: 'xml',
    label: 'XML',
    family: 'structured_data',
    extractor: 'text',
    mediaTypes: ['application/xml', 'text/xml'],
    extensions: ['xml'],
  },
  {
    id: 'yaml',
    label: 'YAML',
    family: 'structured_data',
    extractor: 'text',
    mediaTypes: ['application/yaml', 'application/x-yaml', 'text/yaml'],
    extensions: ['yaml', 'yml'],
  },
  {
    id: 'pptx',
    label: 'PPTX',
    family: 'presentation',
    extractor: 'office',
    mediaTypes: ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
    extensions: ['pptx'],
  },
] as const;

export function bareMediaType(mediaType: string): string {
  return (mediaType.split(';')[0] ?? '').trim().toLowerCase();
}

export function fileExtension(fileName: string): string {
  const trimmed = fileName.trim().toLowerCase();
  const dot = trimmed.lastIndexOf('.');
  return dot > 0 ? trimmed.slice(dot + 1) : '';
}

const DOCUMENT_CLASS_BY_MEDIA_TYPE: ReadonlyMap<string, DocumentClass> = new Map(
  DOCUMENT_CLASSES.flatMap((entry) => entry.mediaTypes.map((type) => [type, entry] as const)),
);

const DOCUMENT_CLASS_BY_EXTENSION: ReadonlyMap<string, DocumentClass> = new Map(
  DOCUMENT_CLASSES.flatMap((entry) => entry.extensions.map((ext) => [ext, entry] as const)),
);

/**
 * The declared class for these bytes, or null when the product never claimed
 * to read them. The media type wins; a renamed file is still what it is.
 */
export function documentClassFor(fileName: string, mediaType: string): DocumentClass | null {
  return (
    DOCUMENT_CLASS_BY_MEDIA_TYPE.get(bareMediaType(mediaType)) ??
    DOCUMENT_CLASS_BY_EXTENSION.get(fileExtension(fileName)) ??
    null
  );
}

export function documentClassById(id: string): DocumentClass | null {
  return DOCUMENT_CLASSES.find((entry) => entry.id === id) ?? null;
}

const MEDIA_TYPES_BY_EXTENSION: Readonly<Record<string, string>> = {
  ...Object.fromEntries(
    DOCUMENT_CLASSES.flatMap((entry) =>
      entry.extensions.map((ext) => [ext, entry.mediaTypes[0] ?? 'application/octet-stream']),
    ),
  ),
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  zip: 'application/zip',
};

/**
 * The media type a file name implies. Local surfaces have no server to ask, so
 * without this each one guessed, and the same `.xlsx` was three types.
 */
export function fileMediaTypeForName(fileName: string): string {
  return MEDIA_TYPES_BY_EXTENSION[fileExtension(fileName)] ?? 'application/octet-stream';
}

export const LOCAL_DEVICE_FILE_ID_PREFIX = 'localfile_';

function localIdentityDigest(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/**
 * The catalogued id for bytes on a device. It is derived from the device and
 * the path rather than being the path, so moving the file does not rename it
 * and two devices holding the same path are two files, not one.
 */
export function localDeviceFileId(path: string, deviceId?: string | null): string {
  const device = (deviceId ?? '').trim();
  const scope = device.length > 0 ? device : 'unpaired';
  return `${LOCAL_DEVICE_FILE_ID_PREFIX}${localIdentityDigest(scope)}_${localIdentityDigest(path)}`;
}

export interface LocalDeviceFileInput {
  /** Absolute path or `file://` uri. It is the address, never the identity. */
  path: string;
  name: string;
  byteCount?: number;
  mediaType?: string;
  origin?: FileOrigin;
  sourceSurface?: SourceSurface | null;
  lineage?: Partial<FileLineage>;
  version?: number;
  parentVersionId?: string | null;
  /** The device the bytes sit on, so the same path elsewhere is a different file. */
  deviceId?: string | null;
  fileId?: string;
  owner?: Partial<FileOwnerScope> | null;
  availability?: Partial<FileAvailability> | null;
  createdAt?: string | null;
}

/**
 * A file the desktop or the phone holds on its own storage. The tier is
 * `local_device` so no consumer tries to fetch the path over the network.
 */
export function localDeviceManagedFile(input: LocalDeviceFileInput): ManagedFile {
  const origin = input.origin ?? 'generated';
  const mediaType = input.mediaType ?? fileMediaTypeForName(input.name);
  return createManagedFile({
    id: input.fileId ?? localDeviceFileId(input.path, input.deviceId ?? null),
    name: input.name,
    mediaType,
    byteCount: input.byteCount ?? 0,
    uri: input.path,
    origin,
    storage: 'local_device',
    parseStatus:
      origin === 'generated' || !isTextLikeFileMediaType(mediaType) ? 'not_applicable' : 'pending',
    sourceSurface: input.sourceSurface ?? null,
    owner: input.owner ?? null,
    availability: input.availability ?? null,
    createdAt: input.createdAt ?? null,
    version: input.version ?? 1,
    parentVersionId: input.parentVersionId ?? null,
    lineage: input.lineage ?? {},
  });
}
