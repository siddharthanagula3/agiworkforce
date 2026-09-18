export type {
  CompleteMultipartUploadInput,
  CopyObjectIfMatchInput,
  CreateMultipartUploadInput,
  MultipartObjectStore,
  MultipartUploadHandle,
  ObjectBody,
  ObjectEncryption,
  ObjectStorageProvider,
  ObjectStore,
  PendingMultipartUpload,
  PresignPutInput,
  PutObjectInput,
  StoredObjectBytes,
  StoredObjectHead,
  StoredObjectStream,
  UploadPartInput,
  UploadedPart,
} from './types';

export {
  ObjectChecksumMismatchError,
  ObjectStorageConfigError,
  ObjectStorageTimeoutError,
  supportsMultipartUploads,
} from './types';

export {
  assertObjectChecksum,
  getVerifiedObject,
  objectChecksum,
  putVerifiedObject,
  type PutVerifiedObjectInput,
} from './checksum';

export {
  abortOrphanedMultipartUploads,
  DEFAULT_ORPHAN_MULTIPART_AGE_MS,
  type AbortOrphanedMultipartUploadsInput,
  type OrphanedMultipartSweep,
} from './lifecycle';

export {
  hasObjectStorageCredentials,
  objectStorageUploadOrigins,
  resolveObjectStorageConfig,
  OBJECT_STORAGE_ACCESS_KEY_ID_ENV,
  OBJECT_STORAGE_BUCKET_ENV,
  OBJECT_STORAGE_ENCRYPTION_ENV,
  OBJECT_STORAGE_ENCRYPTION_KEY_ID_ENV,
  OBJECT_STORAGE_ENDPOINT_ENV,
  OBJECT_STORAGE_FORCE_PATH_STYLE_ENV,
  OBJECT_STORAGE_PRIVATE_BUCKET_ENV,
  OBJECT_STORAGE_PROVIDER_ENV,
  OBJECT_STORAGE_PUBLIC_BASE_URL_ENV,
  OBJECT_STORAGE_REGION_ENV,
  OBJECT_STORAGE_SECRET_ACCESS_KEY_ENV,
  type ObjectStorageConfig,
  type ObjectStorageEnvironment,
} from './config';

export {
  resolveObjectStorageRuntime,
  type ObjectStorageRuntime,
  type ResolveObjectStorageRuntimeOptions,
} from './factory';

export {
  createMemoryObjectStore,
  MemoryObjectStore,
  type MemoryObjectStoreOptions,
} from './adapters/memory';

export {
  createS3Client,
  createS3ObjectStore,
  type S3ClientTimeouts,
  type S3ObjectStoreOptions,
} from './adapters/s3';

export {
  bindPresignedUpload,
  isPresignedUrlExpired,
  presignedUrlExpiresAt,
  PRESIGNED_URL_MAX_TTL_SECONDS,
  type BoundPresignUpload,
} from './presign';

export {
  createRetryingObjectStore,
  isRetryableObjectStorageError,
  resolveObjectStorageRetryPolicy,
  DEFAULT_OBJECT_STORAGE_RETRY_POLICY,
  OBJECT_STORAGE_RETRY_BASE_DELAY_MS_ENV,
  OBJECT_STORAGE_RETRY_MAX_ATTEMPTS_ENV,
  OBJECT_STORAGE_RETRY_MAX_DELAY_MS_ENV,
  type ObjectStorageRetryObservation,
  type ObjectStorageRetryPolicy,
  type RetryingObjectStoreOptions,
} from './retry';
