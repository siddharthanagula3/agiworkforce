import { createHash } from 'node:crypto';
import { objectChecksum } from '../checksum';
import { bindPresignedDownload, bindPresignedUpload, bindPresignedUploadPart } from '../presign';
import { encryptionUploadHeaders } from '../upload-headers';
import {
  ObjectChecksumMismatchError,
  ObjectStorageConfigError,
  type CompleteMultipartUploadInput,
  type CopyObjectIfMatchInput,
  type CreateMultipartUploadInput,
  type MultipartUploadHandle,
  type ObjectBody,
  type ObjectEncryption,
  type ObjectStore,
  type PendingMultipartUpload,
  type PresignGetInput,
  type PresignPutInput,
  type PresignUploadPartInput,
  type PresignedPutRequest,
  type PutObjectInput,
  type StoredObjectBytes,
  type StoredObjectHead,
  type StoredObjectStream,
  type UploadPartInput,
  type UploadedPart,
} from '../types';

const ETAG_HASH_ALGORITHM = 'sha256';
const ETAG_HEX_LENGTH = 32;
const RANGE_PATTERN = /^bytes=(\d+)-(\d*)$/u;
const MILLISECONDS_PER_SECOND = 1_000;
const BUCKET_KEY_SEPARATOR = '\u0000';

const UPLOAD_BUCKET_PARAM = 'bucket';
const UPLOAD_KEY_PARAM = 'key';
const UPLOAD_CONTENT_TYPE_PARAM = 'contentType';
const UPLOAD_CONTENT_LENGTH_PARAM = 'contentLength';
const UPLOAD_EXPIRES_PARAM = 'expiresAt';
const UPLOAD_ID_PARAM = 'uploadId';
const UPLOAD_PART_NUMBER_PARAM = 'partNumber';
const DOWNLOAD_DISPOSITION_PARAM = 'disposition';

interface StoredObject {
  data: Uint8Array;
  contentType: string;
  etag: string;
  checksumSha256: string;
  metadata: Readonly<Record<string, string>> | undefined;
}

interface PendingUpload {
  bucket: string;
  key: string;
  contentType: string;
  metadata: Readonly<Record<string, string>> | undefined;
  initiatedAtMs: number;
  parts: Map<number, { data: Uint8Array; etag: string; checksumSha256: string }>;
}

function etagOf(data: Uint8Array): string {
  return `"${createHash(ETAG_HASH_ALGORITHM).update(data).digest('hex').slice(0, ETAG_HEX_LENGTH)}"`;
}

async function collect(body: ObjectBody): Promise<Uint8Array> {
  // `instanceof` is per-realm, and a jsdom consumer hands this a Uint8Array
  // built elsewhere: it fell through to the stream branch, which iterates a
  // typed array as numbers and stored bytes no caller ever wrote.
  if (ArrayBuffer.isView(body)) {
    return new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of body) {
    const bytes =
      typeof chunk === 'string' ? new TextEncoder().encode(chunk) : new Uint8Array(chunk);
    chunks.push(bytes);
    total += bytes.byteLength;
  }
  const joined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return joined;
}

function streamOf(data: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(data);
      controller.close();
    },
  });
}

interface ResolvedRange {
  start: number;
  end: number;
}

function resolveRange(range: string | undefined, size: number): ResolvedRange | null {
  if (!range) return { start: 0, end: size - 1 };
  const match = RANGE_PATTERN.exec(range);
  if (!match) return null;
  const start = Number(match[1]);
  const end = match[2] ? Number(match[2]) : size - 1;
  if (start > end || end >= size) return null;
  return { start, end };
}

export interface MemoryObjectStoreOptions {
  uploadBaseUrl?: string;
  now?: () => number;
  encryption?: ObjectEncryption;
}

/**
 * The port with no host behind it. Tests and local development get the same
 * observable contract as a real endpoint, which is what makes the shared
 * contract suite meaningful rather than decorative.
 */
export class MemoryObjectStore implements ObjectStore {
  private readonly objects = new Map<string, StoredObject>();

  private readonly uploadBaseUrl: string | undefined;

  private readonly uploads = new Map<string, PendingUpload>();

  private readonly now: () => number;

  private readonly encryption: ObjectEncryption | undefined;

  private nextUploadId = 1;

  constructor(options: MemoryObjectStoreOptions = {}) {
    this.uploadBaseUrl = options.uploadBaseUrl;
    this.now = options.now ?? (() => Date.now());
    this.encryption = options.encryption;
  }

  clear(): void {
    this.objects.clear();
    this.uploads.clear();
  }

  private static address(bucket: string, key: string): string {
    return `${bucket}${BUCKET_KEY_SEPARATOR}${key}`;
  }

  async put(input: PutObjectInput): Promise<void> {
    const data = await collect(input.body);
    const checksumSha256 = objectChecksum(data);
    if (input.checksumSha256 && input.checksumSha256 !== checksumSha256) {
      throw new ObjectChecksumMismatchError(input.key, input.checksumSha256, checksumSha256);
    }
    this.objects.set(MemoryObjectStore.address(input.bucket, input.key), {
      data,
      contentType: input.contentType,
      etag: etagOf(data),
      checksumSha256,
      metadata: input.metadata,
    });
  }

  async get(bucket: string, key: string): Promise<StoredObjectBytes | null> {
    const stored = this.objects.get(MemoryObjectStore.address(bucket, key));
    if (!stored) return null;
    return { data: stored.data, contentType: stored.contentType };
  }

  async getStream(bucket: string, key: string, range?: string): Promise<StoredObjectStream | null> {
    const stored = this.objects.get(MemoryObjectStore.address(bucket, key));
    if (!stored) return null;
    const resolved = resolveRange(range, stored.data.byteLength);
    if (!resolved) return null;
    const slice = stored.data.subarray(resolved.start, resolved.end + 1);
    return {
      body: streamOf(slice),
      contentType: stored.contentType,
      contentLength: slice.byteLength,
      contentRange: range
        ? `bytes ${resolved.start}-${resolved.end}/${stored.data.byteLength}`
        : undefined,
    };
  }

  async head(bucket: string, key: string): Promise<StoredObjectHead | null> {
    const stored = this.objects.get(MemoryObjectStore.address(bucket, key));
    if (!stored) return null;
    return {
      contentLength: stored.data.byteLength,
      contentType: stored.contentType,
      etag: stored.etag,
      checksumSha256: stored.checksumSha256,
      encryption: this.encryption,
      metadata: stored.metadata,
    };
  }

  async delete(bucket: string, key: string): Promise<void> {
    this.objects.delete(MemoryObjectStore.address(bucket, key));
  }

  async copyIfMatch(input: CopyObjectIfMatchInput): Promise<boolean> {
    const stored = this.objects.get(MemoryObjectStore.address(input.bucket, input.sourceKey));
    if (!stored || stored.etag !== input.etag) return false;
    this.objects.set(MemoryObjectStore.address(input.bucket, input.destinationKey), { ...stored });
    return true;
  }

  private pending(handle: MultipartUploadHandle): PendingUpload {
    const upload = this.uploads.get(handle.uploadId);
    if (!upload || upload.bucket !== handle.bucket || upload.key !== handle.key) {
      throw new Error(`No multipart upload ${handle.uploadId} is open for ${handle.key}.`);
    }
    return upload;
  }

  async createMultipartUpload(input: CreateMultipartUploadInput): Promise<MultipartUploadHandle> {
    const uploadId = `upload-${this.nextUploadId++}`;
    this.uploads.set(uploadId, {
      bucket: input.bucket,
      key: input.key,
      contentType: input.contentType,
      metadata: input.metadata,
      initiatedAtMs: this.now(),
      parts: new Map(),
    });
    return { bucket: input.bucket, key: input.key, uploadId };
  }

  async uploadPart(input: UploadPartInput): Promise<UploadedPart> {
    const upload = this.pending(input);
    const checksumSha256 = objectChecksum(input.body);
    if (input.checksumSha256 && input.checksumSha256 !== checksumSha256) {
      throw new ObjectChecksumMismatchError(input.key, input.checksumSha256, checksumSha256);
    }
    const data = new Uint8Array(input.body);
    upload.parts.set(input.partNumber, { data, etag: etagOf(data), checksumSha256 });
    return {
      partNumber: input.partNumber,
      etag: etagOf(data),
      size: data.byteLength,
      checksumSha256,
    };
  }

  async listUploadedParts(handle: MultipartUploadHandle): Promise<UploadedPart[]> {
    const upload = this.pending(handle);
    return [...upload.parts.entries()]
      .sort(([left], [right]) => left - right)
      .map(([partNumber, part]) => ({
        partNumber,
        etag: part.etag,
        size: part.data.byteLength,
        checksumSha256: part.checksumSha256,
      }));
  }

  async completeMultipartUpload(input: CompleteMultipartUploadInput): Promise<void> {
    const upload = this.pending(input);
    const ordered = [...input.parts].sort((left, right) => left.partNumber - right.partNumber);
    const chunks: Uint8Array[] = [];
    for (const part of ordered) {
      const stored = upload.parts.get(part.partNumber);
      if (!stored) throw new Error(`Part ${part.partNumber} of ${input.key} was never uploaded.`);
      if (stored.checksumSha256 !== part.checksumSha256) {
        throw new ObjectChecksumMismatchError(
          input.key,
          part.checksumSha256,
          stored.checksumSha256,
        );
      }
      chunks.push(stored.data);
    }
    const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
    const joined = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      joined.set(chunk, offset);
      offset += chunk.byteLength;
    }
    this.uploads.delete(input.uploadId);
    await this.put({
      bucket: input.bucket,
      key: input.key,
      body: joined,
      contentType: upload.contentType,
      metadata: upload.metadata,
    });
  }

  async abortMultipartUpload(handle: MultipartUploadHandle): Promise<void> {
    this.pending(handle);
    this.uploads.delete(handle.uploadId);
  }

  async listPendingMultipartUploads(
    bucket: string,
    prefix?: string,
  ): Promise<PendingMultipartUpload[]> {
    const pending: PendingMultipartUpload[] = [];
    for (const [uploadId, upload] of this.uploads) {
      if (upload.bucket !== bucket) continue;
      if (prefix && !upload.key.startsWith(prefix)) continue;
      pending.push({ key: upload.key, uploadId, initiatedAtMs: upload.initiatedAtMs });
    }
    return pending;
  }

  private uploadUrl(): URL {
    if (!this.uploadBaseUrl) {
      throw new ObjectStorageConfigError(
        'The memory provider needs an upload base url before it can presign an upload.',
      );
    }
    return new URL(this.uploadBaseUrl);
  }

  async presignUploadPart(input: PresignUploadPartInput): Promise<string> {
    const bound = bindPresignedUploadPart(input);
    this.pending(input);
    const url = this.uploadUrl();
    url.searchParams.set(UPLOAD_BUCKET_PARAM, input.bucket);
    url.searchParams.set(UPLOAD_KEY_PARAM, input.key);
    url.searchParams.set(UPLOAD_ID_PARAM, input.uploadId);
    url.searchParams.set(UPLOAD_PART_NUMBER_PARAM, String(bound.partNumber));
    url.searchParams.set(UPLOAD_CONTENT_LENGTH_PARAM, String(bound.contentLength));
    url.searchParams.set(
      UPLOAD_EXPIRES_PARAM,
      String(this.now() + bound.expiresInSeconds * MILLISECONDS_PER_SECOND),
    );
    return url.toString();
  }

  async presignGet(input: PresignGetInput): Promise<string> {
    const bound = bindPresignedDownload(input);
    const url = this.uploadUrl();
    url.searchParams.set(UPLOAD_BUCKET_PARAM, input.bucket);
    url.searchParams.set(UPLOAD_KEY_PARAM, input.key);
    if (bound.contentDisposition) {
      url.searchParams.set(DOWNLOAD_DISPOSITION_PARAM, bound.contentDisposition);
    }
    url.searchParams.set(
      UPLOAD_EXPIRES_PARAM,
      String(this.now() + bound.expiresInSeconds * MILLISECONDS_PER_SECOND),
    );
    return url.toString();
  }

  async presignPut(input: PresignPutInput): Promise<PresignedPutRequest> {
    const bound = bindPresignedUpload(input);
    const url = this.uploadUrl();
    url.searchParams.set(UPLOAD_BUCKET_PARAM, input.bucket);
    url.searchParams.set(UPLOAD_KEY_PARAM, input.key);
    url.searchParams.set(UPLOAD_CONTENT_TYPE_PARAM, bound.contentType);
    url.searchParams.set(UPLOAD_CONTENT_LENGTH_PARAM, String(bound.contentLength));
    url.searchParams.set(
      UPLOAD_EXPIRES_PARAM,
      String(this.now() + bound.expiresInSeconds * MILLISECONDS_PER_SECOND),
    );
    return { url: url.toString(), headers: encryptionUploadHeaders(this.encryption) };
  }
}

export function createMemoryObjectStore(options: MemoryObjectStoreOptions = {}): MemoryObjectStore {
  return new MemoryObjectStore(options);
}
