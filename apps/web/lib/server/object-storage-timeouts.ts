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
