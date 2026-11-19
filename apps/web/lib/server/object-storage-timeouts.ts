import 'server-only';

/**
 * Shared deadlines for every network call this app makes to object storage,
 * whichever path it takes there - the R2 S3Client's own request handler and
 * any plain `fetch` against a storage URL both read from here, so the two
 * can never drift apart and leave one of them unbounded.
 *
 * Left unset, the AWS SDK's Node request handler applies no request timeout
 * at all and no connection timeout either; a stalled socket then blocks for
 * however long the underlying OS takes to give up, which is tens of seconds
 * on a cold or flaky path - not the few seconds a chat turn can actually wait.
 */
export const OBJECT_STORAGE_CONNECTION_TIMEOUT_MS = 3_000;
export const OBJECT_STORAGE_REQUEST_TIMEOUT_MS = 10_000;

/**
 * A server-side copy takes time in proportion to the object, so its deadline
 * grows with the bytes copied. Measured against the staging bucket before
 * large files are turned on (docs/specs/large-file-uploads/plan.md).
 */
export const OBJECT_STORAGE_COPY_BASE_TIMEOUT_MS = 30_000;
export const OBJECT_STORAGE_COPY_TIMEOUT_STEP_MS = 1_000;
export const OBJECT_STORAGE_COPY_TIMEOUT_STEP_BYTES = 10 * 1024 * 1024;

export function objectStorageCopyTimeoutMs(byteCount: number): number {
  if (!Number.isSafeInteger(byteCount) || byteCount < 0) {
    throw new RangeError('A copy deadline needs a whole, non-negative byte count.');
  }
  return (
    OBJECT_STORAGE_COPY_BASE_TIMEOUT_MS +
    Math.ceil(byteCount / OBJECT_STORAGE_COPY_TIMEOUT_STEP_BYTES) *
      OBJECT_STORAGE_COPY_TIMEOUT_STEP_MS
  );
}
