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
  type FileOrigin,
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
}

/**
 * The next revision of the same file. The lineage is carried forward unchanged:
 * a new version is the same file, so where it originally came from does not move.
 */
export function nextFileVersion(current: ManagedFile, input: NextFileVersionInput): ManagedFile {
  return {
    ...current,
    id: input.id,
    uri: input.uri,
    name: input.name ?? current.name,
    mediaType: input.mediaType ?? current.mediaType,
    byteCount:
      input.byteCount === undefined ? current.byteCount : Math.max(0, Math.trunc(input.byteCount)),
    checksumSha256: input.checksumSha256 === undefined ? null : input.checksumSha256,
    version: current.version + 1,
    parentVersionId: current.id,
  };
}

/**
 * A different file produced from this one. It starts its own version chain,
 * and it names the source it came from so the chain can be walked back.
 */
export function deriveManagedFile(
  source: ManagedFile,
  input: ManagedFileInput & { derivation: FileDerivation },
): ManagedFile {
  return createManagedFile({
    ...input,
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

const MEDIA_TYPES_BY_EXTENSION: Readonly<Record<string, string>> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  pdf: 'application/pdf',
  csv: 'text/csv',
  tsv: 'text/tab-separated-values',
  md: 'text/markdown',
  markdown: 'text/markdown',
  txt: 'text/plain',
  html: 'text/html',
  json: 'application/json',
  xml: 'application/xml',
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
  const extension = fileName.toLowerCase().split('.').pop() ?? '';
  return MEDIA_TYPES_BY_EXTENSION[extension] ?? 'application/octet-stream';
}

export interface LocalDeviceFileInput {
  /** Absolute path or `file://` uri. It is the identity: nothing has catalogued these bytes. */
  path: string;
  name: string;
  byteCount?: number;
  mediaType?: string;
  origin?: FileOrigin;
  sourceSurface?: SourceSurface | null;
  lineage?: Partial<FileLineage>;
  version?: number;
  parentVersionId?: string | null;
}

/**
 * A file the desktop or the phone holds on its own storage. The tier is
 * `local_device` so no consumer tries to fetch the path over the network.
 */
export function localDeviceManagedFile(input: LocalDeviceFileInput): ManagedFile {
  const origin = input.origin ?? 'generated';
  const mediaType = input.mediaType ?? fileMediaTypeForName(input.name);
  return createManagedFile({
    id: input.path,
    name: input.name,
    mediaType,
    byteCount: input.byteCount ?? 0,
    uri: input.path,
    origin,
    storage: 'local_device',
    parseStatus:
      origin === 'generated' || !isTextLikeFileMediaType(mediaType) ? 'not_applicable' : 'pending',
    sourceSurface: input.sourceSurface ?? null,
    version: input.version ?? 1,
    parentVersionId: input.parentVersionId ?? null,
    lineage: input.lineage ?? {},
  });
}
