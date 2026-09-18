import {
  ObjectStorageTimeoutError,
  supportsMultipartUploads,
  type CompleteMultipartUploadInput,
  type CopyObjectIfMatchInput,
  type CreateMultipartUploadInput,
  type MultipartUploadHandle,
  type ObjectStore,
  type PendingMultipartUpload,
  type PresignPutInput,
  type PutObjectInput,
  type StoredObjectBytes,
  type StoredObjectHead,
  type StoredObjectStream,
  type UploadPartInput,
  type UploadedPart,
} from './types';

export const OBJECT_STORAGE_RETRY_MAX_ATTEMPTS_ENV = 'AGI_STORAGE_RETRY_MAX_ATTEMPTS';
export const OBJECT_STORAGE_RETRY_BASE_DELAY_MS_ENV = 'AGI_STORAGE_RETRY_BASE_DELAY_MS';
export const OBJECT_STORAGE_RETRY_MAX_DELAY_MS_ENV = 'AGI_STORAGE_RETRY_MAX_DELAY_MS';

export const DEFAULT_OBJECT_STORAGE_RETRY_POLICY: ObjectStorageRetryPolicy = {
  maxAttempts: 3,
  baseDelayMs: 100,
  maxDelayMs: 2_000,
};

const MIN_ATTEMPTS = 1;
const MAX_ATTEMPTS_CEILING = 10;
const MAX_DELAY_CEILING_MS = 30_000;
const BACKOFF_FACTOR = 2;
const FULL_JITTER_FLOOR = 0.5;
const TOO_MANY_REQUESTS = 429;
const REQUEST_TIMEOUT = 408;
const SERVER_ERROR_FLOOR = 500;
const NOT_IMPLEMENTED = 501;

const RETRYABLE_ERROR_NAMES: ReadonlySet<string> = new Set([
  'InternalError',
  'RequestTimeout',
  'RequestTimeTooSkewed',
  'ServiceUnavailable',
  'SlowDown',
  'ThrottlingException',
  'TimeoutError',
]);

const RETRYABLE_ERROR_CODES: ReadonlySet<string> = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'EPIPE',
  'ETIMEDOUT',
  'EAI_AGAIN',
]);

export interface ObjectStorageRetryPolicy {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

export interface ObjectStorageRetryObservation {
  operation: string;
  attempt: number;
  delayMs: number;
  error: unknown;
}

export interface RetryingObjectStoreOptions {
  policy?: Partial<ObjectStorageRetryPolicy>;
  sleep?: (milliseconds: number) => Promise<void>;
  random?: () => number;
  onRetry?: (observation: ObjectStorageRetryObservation) => void;
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high);
}

function readNumber(
  env: Record<string, string | undefined>,
  name: string,
  fallback: number,
): number {
  const raw = env[name]?.trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function resolveObjectStorageRetryPolicy(
  env: Record<string, string | undefined> = typeof process === 'undefined' ? {} : process.env,
): ObjectStorageRetryPolicy {
  const defaults = DEFAULT_OBJECT_STORAGE_RETRY_POLICY;
  const maxDelayMs = clamp(
    readNumber(env, OBJECT_STORAGE_RETRY_MAX_DELAY_MS_ENV, defaults.maxDelayMs),
    0,
    MAX_DELAY_CEILING_MS,
  );
  return {
    maxAttempts: clamp(
      Math.round(readNumber(env, OBJECT_STORAGE_RETRY_MAX_ATTEMPTS_ENV, defaults.maxAttempts)),
      MIN_ATTEMPTS,
      MAX_ATTEMPTS_CEILING,
    ),
    baseDelayMs: clamp(
      readNumber(env, OBJECT_STORAGE_RETRY_BASE_DELAY_MS_ENV, defaults.baseDelayMs),
      0,
      maxDelayMs,
    ),
    maxDelayMs,
  };
}

function statusCode(error: unknown): number | undefined {
  const candidate = error as
    { $metadata?: { httpStatusCode?: number }; statusCode?: number } | null | undefined;
  return candidate?.$metadata?.httpStatusCode ?? candidate?.statusCode;
}

export function isRetryableObjectStorageError(error: unknown): boolean {
  if (error instanceof ObjectStorageTimeoutError) return true;

  const named = error as { name?: string; code?: string; cause?: unknown } | null | undefined;
  if (named?.name && RETRYABLE_ERROR_NAMES.has(named.name)) return true;
  if (named?.code && RETRYABLE_ERROR_CODES.has(named.code)) return true;

  const status = statusCode(error);
  if (status === TOO_MANY_REQUESTS || status === REQUEST_TIMEOUT) return true;
  if (status !== undefined && status >= SERVER_ERROR_FLOOR && status !== NOT_IMPLEMENTED) {
    return true;
  }

  return named?.cause !== undefined && named.cause !== error
    ? isRetryableObjectStorageError(named.cause)
    : false;
}

/**
 * A body that is a stream has already been consumed by the attempt that
 * failed, so replaying the call would upload a truncated object. Only a
 * materialised buffer can be sent twice.
 */
function isReplayable(input: PutObjectInput): boolean {
  return input.body instanceof Uint8Array;
}

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

export function createRetryingObjectStore(
  store: ObjectStore,
  options: RetryingObjectStoreOptions = {},
): ObjectStore {
  const policy = { ...resolveObjectStorageRetryPolicy(), ...options.policy };
  const sleep = options.sleep ?? defaultSleep;
  const random = options.random ?? Math.random;

  function backoffFor(attempt: number): number {
    const exponential = policy.baseDelayMs * BACKOFF_FACTOR ** (attempt - 1);
    const bounded = Math.min(exponential, policy.maxDelayMs);
    return Math.round(bounded * (FULL_JITTER_FLOOR + random() * FULL_JITTER_FLOOR));
  }

  async function run<T>(
    operation: string,
    call: () => Promise<T>,
    attempts = policy.maxAttempts,
  ): Promise<T> {
    let attempt = 1;
    for (;;) {
      try {
        return await call();
      } catch (error) {
        if (attempt >= attempts || !isRetryableObjectStorageError(error)) throw error;
        const delayMs = backoffFor(attempt);
        options.onRetry?.({ operation, attempt, delayMs, error });
        await sleep(delayMs);
        attempt += 1;
      }
    }
  }

  return {
    put(input: PutObjectInput): Promise<void> {
      return run('put', () => store.put(input), isReplayable(input) ? policy.maxAttempts : 1);
    },

    get(bucket: string, key: string): Promise<StoredObjectBytes | null> {
      return run('get', () => store.get(bucket, key));
    },

    getStream(bucket: string, key: string, range?: string): Promise<StoredObjectStream | null> {
      return run('getStream', () => store.getStream(bucket, key, range));
    },

    head(bucket: string, key: string): Promise<StoredObjectHead | null> {
      return run('head', () => store.head(bucket, key));
    },

    delete(bucket: string, key: string): Promise<void> {
      return run('delete', () => store.delete(bucket, key));
    },

    copyIfMatch(input: CopyObjectIfMatchInput): Promise<boolean> {
      return run('copyIfMatch', () => store.copyIfMatch(input));
    },

    presignPut(input: PresignPutInput): Promise<string> {
      return run('presignPut', () => store.presignPut(input));
    },

    ...(supportsMultipartUploads(store)
      ? {
          createMultipartUpload(input: CreateMultipartUploadInput): Promise<MultipartUploadHandle> {
            return run('createMultipartUpload', () => store.createMultipartUpload(input));
          },

          uploadPart(input: UploadPartInput): Promise<UploadedPart> {
            return run('uploadPart', () => store.uploadPart(input));
          },

          listUploadedParts(handle: MultipartUploadHandle): Promise<UploadedPart[]> {
            return run('listUploadedParts', () => store.listUploadedParts(handle));
          },

          completeMultipartUpload(input: CompleteMultipartUploadInput): Promise<void> {
            return run('completeMultipartUpload', () => store.completeMultipartUpload(input));
          },

          abortMultipartUpload(handle: MultipartUploadHandle): Promise<void> {
            return run('abortMultipartUpload', () => store.abortMultipartUpload(handle));
          },

          listPendingMultipartUploads(
            bucket: string,
            prefix?: string,
          ): Promise<PendingMultipartUpload[]> {
            return run('listPendingMultipartUploads', () =>
              store.listPendingMultipartUploads(bucket, prefix),
            );
          },
        }
      : {}),
  };
}
