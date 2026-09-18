import 'server-only';

import {
  supportsMultipartUploads,
  type MultipartObjectStore,
  type UploadedPart,
} from '@agiworkforce/object-storage';
import { createError } from '@/lib/errors';
import { isPrivateObjectStorageConfigured } from '@/lib/server/object-storage';
import { getObjectStore, objectStorageConfig } from '@/lib/server/object-storage-runtime';
import { videoStoragePathname } from '@/lib/server/media-storage';
import type { UpsertVideoMediaAssetParams } from '@/lib/server/media-assets';

export const RESUMABLE_PART_SIZE_BYTES = 8 * 1024 * 1024;
export const MAX_RESUMABLE_UPLOAD_BYTES = 256 * 1024 * 1024;
export const MAX_RESUMABLE_PARTS = Math.ceil(
  MAX_RESUMABLE_UPLOAD_BYTES / RESUMABLE_PART_SIZE_BYTES,
);

type ResumableMimeType = UpsertVideoMediaAssetParams['mimeType'];

const RESUMABLE_MIME_TYPES = [
  'video/mp4',
  'video/webm',
  'video/quicktime',
] as const satisfies readonly ResumableMimeType[];

export function isResumableMimeType(value: string): value is ResumableMimeType {
  return (RESUMABLE_MIME_TYPES as readonly string[]).includes(value);
}

export interface ResumableUploadTarget {
  store: MultipartObjectStore;
  bucket: string;
  key: string;
}

/**
 * The key is derived from the caller's own user id, never taken from the
 * request, so an upload id belonging to somebody else resolves to a key the
 * host has no session for and the part is refused rather than misfiled.
 */
export function resumableUploadTarget(
  userId: string,
  assetId: string,
  mimeType: ResumableMimeType,
): ResumableUploadTarget {
  if (!isPrivateObjectStorageConfigured()) {
    throw createError.internal('Private object storage is not configured');
  }
  const bucket = objectStorageConfig().privateBucket;
  if (!bucket) {
    throw createError.internal('Private object storage is not configured');
  }
  const store = getObjectStore();
  if (!supportsMultipartUploads(store)) {
    throw createError.internal('This storage host cannot resume a large upload');
  }
  return {
    store,
    bucket,
    key: videoStoragePathname({ userId, storageId: assetId, contentType: mimeType }),
  };
}

export function assertPartNumber(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_RESUMABLE_PARTS) {
    throw createError.validation(`A part number must be between 1 and ${MAX_RESUMABLE_PARTS}.`);
  }
  return value;
}

export function assertPartSize(partNumber: number, byteLength: number): number {
  if (byteLength <= 0) {
    throw createError.validation('An uploaded part must carry bytes.');
  }
  if (byteLength > RESUMABLE_PART_SIZE_BYTES) {
    throw createError.validation(
      `Part ${partNumber} is larger than the ${RESUMABLE_PART_SIZE_BYTES} byte part size.`,
    );
  }
  return byteLength;
}

export function storedBytes(parts: readonly UploadedPart[]): number {
  return parts.reduce((total, part) => total + part.size, 0);
}
