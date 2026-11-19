import {
  supportsMultipartUploads,
  supportsObjectListing,
  type ListedObject,
  type ObjectStore,
} from './types';

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

export interface DeleteObjectsUnderPrefixInput {
  bucket: string;
  prefix: string;
  /** Only objects written at least this long ago go; without it every listed object does. */
  olderThanMs?: number;
  now?: number;
  /** Only objects whose key this accepts go. */
  matching?: (key: string) => boolean;
  /** The most objects one call deletes, so a sweep stays bounded per run. */
  limit?: number;
  /** The most keys one call lists while it looks for objects to delete. */
  scanLimit?: number;
}

export interface PrefixObjectSweep {
  supported: boolean;
  listed: number;
  deleted: number;
  failed: number;
}

const PREFIX_SWEEP_PAGE_KEYS = 1_000;

/**
 * Objects that only a key layout records, such as pieces of an upload that
 * never finished, cannot be found from any row. This lists them by prefix and
 * deletes them, paging past the objects it keeps. An object whose write time
 * the host does not report is kept by an age sweep, since it may still be in
 * use.
 */
export async function deleteObjectsUnderPrefix(
  store: ObjectStore,
  input: DeleteObjectsUnderPrefixInput,
): Promise<PrefixObjectSweep> {
  if (!input.prefix) throw new Error('A prefix sweep needs a prefix.');
  if (!supportsObjectListing(store)) {
    return { supported: false, listed: 0, deleted: 0, failed: 0 };
  }

  const deadline =
    input.olderThanMs === undefined ? null : (input.now ?? Date.now()) - input.olderThanMs;
  const due = (object: ListedObject): boolean =>
    (deadline === null ||
      (object.lastModifiedMs !== undefined && object.lastModifiedMs <= deadline)) &&
    (input.matching === undefined || input.matching(object.key));
  const sweep: PrefixObjectSweep = { supported: true, listed: 0, deleted: 0, failed: 0 };
  const budgetSpent = (): boolean =>
    input.limit !== undefined && sweep.deleted + sweep.failed >= input.limit;

  let startAfter: string | undefined;
  for (;;) {
    const pageKeys = Math.min(
      PREFIX_SWEEP_PAGE_KEYS,
      (input.scanLimit ?? Number.POSITIVE_INFINITY) - sweep.listed,
    );
    if (pageKeys <= 0 || budgetSpent()) return sweep;
    const page = await store.listObjects(input.bucket, input.prefix, pageKeys, startAfter);
    sweep.listed += page.length;
    for (const object of page) {
      if (budgetSpent()) return sweep;
      if (!due(object)) continue;
      try {
        await store.delete(input.bucket, object.key);
        sweep.deleted += 1;
      } catch {
        sweep.failed += 1;
      }
    }
    if (page.length < pageKeys) return sweep;
    startAfter = page[page.length - 1]?.key;
  }
}
