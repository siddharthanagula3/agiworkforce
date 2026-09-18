/**
 * The one place each surface's native file shape becomes a {@link ManagedFile}.
 *
 * Web sent `GeneratedFileWire`, desktop described a document by its path on
 * disk, and mobile described an export by its `file://` uri. The three were
 * never comparable, so the same bytes exported on a phone and re-opened on the
 * desktop were two unrelated files. The adapters below all produce one type, so
 * they are.
 *
 * The input shapes are declared structurally rather than imported: this package
 * sits under every surface, so it must not depend on any of them.
 */

import {
  createManagedFile,
  isTextLikeFileMediaType,
  localDeviceManagedFile,
  resolveGeneratedFileKind,
  type FileLineage,
  type FileOrigin,
  type ManagedFile,
  type SourceSurface,
} from '@agiworkforce/types';

export interface SurfaceFileOptions {
  sourceSurface?: SourceSurface | null;
  lineage?: Partial<FileLineage>;
  version?: number;
  parentVersionId?: string | null;
}

/** The wire shape a generated file crosses the network in. */
export interface GeneratedFileWireLike {
  id: string;
  file_name: string;
  mime_type: string;
  uri: string;
  byte_count: number;
  kind?: string;
  checksum_sha256?: string | undefined;
  surface?: string;
  previewable?: boolean;
}

/** The shape an uploaded chat attachment is handed back to the composer in. */
export interface UploadedFileLike {
  id: string;
  name: string;
  mimeType: string;
  byteCount: number;
  url: string;
}

/** A document a desktop surface holds on the local filesystem. */
export interface LocalDocumentLike {
  file_path: string;
  file_name: string;
  file_size: number;
  mime_type?: string;
}

/** A file a mobile surface wrote into its own sandbox. */
export interface DeviceExportLike {
  uri: string;
  fileName: string;
  mimeType?: string;
}

function parseStatusFor(mediaType: string, origin: FileOrigin): ManagedFile['parseStatus'] {
  if (origin === 'generated') return 'not_applicable';
  return isTextLikeFileMediaType(mediaType) ? 'pending' : 'not_applicable';
}

export function managedFileFromGeneratedWire(
  file: GeneratedFileWireLike,
  options: SurfaceFileOptions = {},
): ManagedFile {
  return createManagedFile({
    id: file.id,
    name: file.file_name,
    mediaType: file.mime_type,
    byteCount: file.byte_count,
    uri: file.uri,
    origin: 'generated',
    parseStatus: 'not_applicable',
    checksumSha256: file.checksum_sha256 ?? null,
    sourceSurface: options.sourceSurface ?? null,
    version: options.version ?? 1,
    parentVersionId: options.parentVersionId ?? null,
    lineage: options.lineage ?? {},
  });
}

/**
 * The inverse of {@link managedFileFromGeneratedWire}. Version and lineage do
 * not fit on the wire shape, so a round trip is lossy by construction; it is
 * the file's identity that must survive it, which is what the tests assert.
 */
export function generatedWireFromManagedFile(file: ManagedFile): GeneratedFileWireLike {
  return {
    id: file.id,
    file_name: file.name,
    mime_type: file.mediaType,
    uri: file.uri,
    byte_count: file.byteCount,
    kind: resolveGeneratedFileKind(file.name, file.mediaType),
    checksum_sha256: file.checksumSha256 ?? undefined,
  };
}

export function managedFileFromUpload(
  attachment: UploadedFileLike,
  options: SurfaceFileOptions & { checksumSha256?: string | null } = {},
): ManagedFile {
  return createManagedFile({
    id: attachment.id,
    name: attachment.name,
    mediaType: attachment.mimeType,
    byteCount: attachment.byteCount,
    uri: attachment.url,
    origin: 'upload',
    parseStatus: parseStatusFor(attachment.mimeType, 'upload'),
    checksumSha256: options.checksumSha256 ?? null,
    sourceSurface: options.sourceSurface ?? null,
    version: options.version ?? 1,
    parentVersionId: options.parentVersionId ?? null,
    lineage: options.lineage ?? {},
  });
}

/** Bytes on the machine the surface runs on, named the way desktop names them. */
export function managedFileFromLocalDocument(
  document: LocalDocumentLike,
  options: SurfaceFileOptions & { origin?: FileOrigin } = {},
): ManagedFile {
  return localDeviceManagedFile({
    path: document.file_path,
    name: document.file_name,
    byteCount: document.file_size,
    ...(document.mime_type ? { mediaType: document.mime_type } : {}),
    origin: options.origin ?? 'generated',
    sourceSurface: options.sourceSurface ?? null,
    lineage: options.lineage ?? {},
    version: options.version ?? 1,
    parentVersionId: options.parentVersionId ?? null,
  });
}

/** The same bytes, named the way a mobile export names them. */
export function managedFileFromDeviceExport(
  exported: DeviceExportLike,
  options: SurfaceFileOptions & { byteCount?: number } = {},
): ManagedFile {
  return managedFileFromLocalDocument(
    {
      file_path: exported.uri,
      file_name: exported.fileName,
      file_size: options.byteCount ?? 0,
      ...(exported.mimeType ? { mime_type: exported.mimeType } : {}),
    },
    { ...options, origin: 'generated' },
  );
}
