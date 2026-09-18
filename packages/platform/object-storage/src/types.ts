import type { Readable } from 'node:stream';

export type ObjectStorageProvider = 's3' | 'memory' | 'none';

export type ObjectBody = Uint8Array | Readable;

export interface ObjectEncryption {
  algorithm: string;
  keyId: string | undefined;
}

export interface PutObjectInput {
  bucket: string;
  key: string;
  body: ObjectBody;
  contentType: string;
  contentLength?: number;
  checksumSha256?: string;
  metadata?: Readonly<Record<string, string>>;
}

export interface StoredObjectBytes {
  data: Uint8Array;
  contentType: string | undefined;
}

export interface StoredObjectStream {
  body: ReadableStream<Uint8Array>;
  contentType: string | undefined;
  contentLength: number | undefined;
  contentRange: string | undefined;
}

export interface StoredObjectHead {
  contentLength: number | undefined;
  contentType: string | undefined;
  etag: string | undefined;
  checksumSha256: string | undefined;
  encryption: ObjectEncryption | undefined;
  metadata: Readonly<Record<string, string>> | undefined;
}

export interface CopyObjectIfMatchInput {
  bucket: string;
  sourceKey: string;
  destinationKey: string;
  etag: string;
}

export interface PresignPutInput {
  bucket: string;
  key: string;
  contentType: string;
  contentLength: number;
  expiresInSeconds: number;
}

export interface CreateMultipartUploadInput {
  bucket: string;
  key: string;
  contentType: string;
  metadata?: Readonly<Record<string, string>>;
}

export interface MultipartUploadHandle {
  bucket: string;
  key: string;
  uploadId: string;
}

export interface UploadPartInput {
  bucket: string;
  key: string;
  uploadId: string;
  partNumber: number;
  body: Uint8Array;
  checksumSha256?: string;
}

export interface UploadedPart {
  partNumber: number;
  etag: string;
  size: number;
  checksumSha256: string;
}

export interface CompleteMultipartUploadInput {
  bucket: string;
  key: string;
  uploadId: string;
  parts: readonly UploadedPart[];
}

export interface PendingMultipartUpload {
  key: string;
  uploadId: string;
  initiatedAtMs: number;
}

/**
 * Every object-storage operation the product performs. A host is swapped by
 * pointing the configuration at a different endpoint, so nothing here names a
 * vendor, a bucket layout, or an SDK type.
 */
export interface ObjectStore {
  put(input: PutObjectInput): Promise<void>;

  get(bucket: string, key: string): Promise<StoredObjectBytes | null>;

  getStream(bucket: string, key: string, range?: string): Promise<StoredObjectStream | null>;

  head(bucket: string, key: string): Promise<StoredObjectHead | null>;

  delete(bucket: string, key: string): Promise<void>;

  /**
   * Copies only when the source still carries the given entity tag, so bytes
   * that were inspected are the bytes that get served. Resolves `false` when
   * the precondition fails.
   */
  copyIfMatch(input: CopyObjectIfMatchInput): Promise<boolean>;

  presignPut(input: PresignPutInput): Promise<string>;

  /**
   * Multipart is optional because a host may not offer it; every consumer goes
   * through `supportsMultipartUploads` rather than assuming it is there.
   */
  createMultipartUpload?(input: CreateMultipartUploadInput): Promise<MultipartUploadHandle>;

  uploadPart?(input: UploadPartInput): Promise<UploadedPart>;

  listUploadedParts?(handle: MultipartUploadHandle): Promise<UploadedPart[]>;

  completeMultipartUpload?(input: CompleteMultipartUploadInput): Promise<void>;

  abortMultipartUpload?(handle: MultipartUploadHandle): Promise<void>;

  listPendingMultipartUploads?(bucket: string, prefix?: string): Promise<PendingMultipartUpload[]>;
}

export type MultipartObjectStore = ObjectStore &
  Required<
    Pick<
      ObjectStore,
      | 'createMultipartUpload'
      | 'uploadPart'
      | 'listUploadedParts'
      | 'completeMultipartUpload'
      | 'abortMultipartUpload'
      | 'listPendingMultipartUploads'
    >
  >;

const MULTIPART_OPERATIONS = [
  'createMultipartUpload',
  'uploadPart',
  'listUploadedParts',
  'completeMultipartUpload',
  'abortMultipartUpload',
  'listPendingMultipartUploads',
] as const;

export function supportsMultipartUploads(store: ObjectStore): store is MultipartObjectStore {
  return MULTIPART_OPERATIONS.every((operation) => typeof store[operation] === 'function');
}

export class ObjectStorageConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ObjectStorageConfigError';
  }
}

export class ObjectChecksumMismatchError extends Error {
  constructor(
    readonly key: string,
    readonly expected: string,
    readonly actual: string,
  ) {
    super(`Object ${key} does not match the checksum it was stored with.`);
    this.name = 'ObjectChecksumMismatchError';
  }
}

export class ObjectStorageTimeoutError extends Error {
  constructor(readonly timeoutMs: number) {
    super(`Object storage request exceeded ${timeoutMs}ms`);
    this.name = 'ObjectStorageTimeoutError';
  }
}
