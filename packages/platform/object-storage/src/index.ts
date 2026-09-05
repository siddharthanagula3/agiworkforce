export type {
  CopyObjectIfMatchInput,
  ObjectBody,
  ObjectStorageProvider,
  ObjectStore,
  PresignPutInput,
  PutObjectInput,
  StoredObjectBytes,
  StoredObjectHead,
  StoredObjectStream,
} from './types';

export { ObjectStorageConfigError, ObjectStorageTimeoutError } from './types';

export {
  hasObjectStorageCredentials,
  objectStorageUploadOrigins,
  resolveObjectStorageConfig,
  OBJECT_STORAGE_ACCESS_KEY_ID_ENV,
  OBJECT_STORAGE_BUCKET_ENV,
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

export { bindPresignedUpload, type BoundPresignUpload } from './presign';
