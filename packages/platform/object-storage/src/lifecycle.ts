import { supportsMultipartUploads, type ObjectStore } from './types';

export const DEFAULT_ORPHAN_MULTIPART_AGE_MS = 24 * 60 * 60 * 1_000;

export interface AbortOrphanedMultipartUploadsInput {
  bucket: string;
  prefix?: string;
  olderThanMs?: number;
  now?: number;
  limit?: number;
}

export interface OrphanedMultipartSweep {
  supported: boolean;
  pending: number;
  aborted: number;
  failed: number;
}

/**
 * A part that was uploaded and never completed is billed storage nobody can
 * read. The host expires nothing on its own, so the sweep is the only thing
 * that closes them.
 */
export async function abortOrphanedMultipartUploads(
  store: ObjectStore,
  input: AbortOrphanedMultipartUploadsInput,
): Promise<OrphanedMultipartSweep> {
  if (!supportsMultipartUploads(store)) {
    return { supported: false, pending: 0, aborted: 0, failed: 0 };
  }

  const now = input.now ?? Date.now();
  const olderThanMs = input.olderThanMs ?? DEFAULT_ORPHAN_MULTIPART_AGE_MS;
  const deadline = now - olderThanMs;

  const uploads = await store.listPendingMultipartUploads(input.bucket, input.prefix);
  const orphans = uploads
    .filter((upload) => upload.initiatedAtMs <= deadline)
    .slice(0, input.limit ?? uploads.length);

  let aborted = 0;
  let failed = 0;
  for (const upload of orphans) {
    try {
      await store.abortMultipartUpload({
        bucket: input.bucket,
        key: upload.key,
        uploadId: upload.uploadId,
      });
      aborted += 1;
    } catch {
      failed += 1;
    }
  }

  return { supported: true, pending: uploads.length, aborted, failed };
}
