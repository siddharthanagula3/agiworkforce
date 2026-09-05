import type { Readable } from 'node:stream';

export type ObjectStorageProvider = 's3' | 'memory' | 'none';

export type ObjectBody = Uint8Array | Readable;

export interface PutObjectInput {
  bucket: string;
  key: string;
  body: ObjectBody;
  contentType: string;
  contentLength?: number;
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
}

export class ObjectStorageConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ObjectStorageConfigError';
  }
}

export class ObjectStorageTimeoutError extends Error {
  constructor(readonly timeoutMs: number) {
    super(`Object storage request exceeded ${timeoutMs}ms`);
    this.name = 'ObjectStorageTimeoutError';
  }
}
