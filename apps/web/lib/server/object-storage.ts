import 'server-only';

import {
  hasObjectStorageCredentials,
  ObjectStorageConfigError,
  OBJECT_STORAGE_BUCKET_ENV,
  OBJECT_STORAGE_PRIVATE_BUCKET_ENV,
  OBJECT_STORAGE_PUBLIC_BASE_URL_ENV,
  type ObjectStorageConfig,
  type ObjectStore,
} from '@agiworkforce/object-storage';
import type { Readable } from 'node:stream';
import { createHash } from 'node:crypto';
import { getObjectStore, objectStorageConfig } from './object-storage-runtime';

export { ObjectStorageTimeoutError } from '@agiworkforce/object-storage';
export type { StoredObjectStream, StoredObjectHead } from '@agiworkforce/object-storage';

const R2_BUCKET_ENV_NAME = 'CLOUDFLARE_R2_BUCKET_NAME';
const R2_PRIVATE_BUCKET_ENV_NAME = 'CLOUDFLARE_R2_PRIVATE_BUCKET_NAME';
const R2_PUBLIC_BASE_URL_ENV_NAME = 'CLOUDFLARE_R2_PUBLIC_BASE_URL';
const DEFAULT_PRESIGNED_UPLOAD_TTL_SECONDS = 300;

function missingSetting(neutralName: string, legacyName: string): ObjectStorageConfigError {
  return new ObjectStorageConfigError(`${neutralName} or ${legacyName} is not configured.`);
}

export function isObjectStorageConfigured(): boolean {
  const config = objectStorageConfig();
  return Boolean(
    hasObjectStorageCredentials(config) && config.publicBucket && config.publicBaseUrl,
  );
}

export function isPrivateObjectStorageConfigured(): boolean {
  const config = objectStorageConfig();
  return Boolean(
    hasObjectStorageCredentials(config) &&
    config.privateBucket &&
    (!config.publicBucket || config.privateBucket !== config.publicBucket),
  );
}

function publicBucketName(config: ObjectStorageConfig = objectStorageConfig()): string {
  if (!config.publicBucket) throw missingSetting(OBJECT_STORAGE_BUCKET_ENV, R2_BUCKET_ENV_NAME);
  return config.publicBucket;
}

function privateBucketName(config: ObjectStorageConfig = objectStorageConfig()): string {
  if (!config.privateBucket) {
    throw missingSetting(OBJECT_STORAGE_PRIVATE_BUCKET_ENV, R2_PRIVATE_BUCKET_ENV_NAME);
  }
  if (config.publicBucket && config.privateBucket === config.publicBucket) {
    throw new ObjectStorageConfigError(
      'The private storage bucket must be distinct from the public storage bucket.',
    );
  }
  return config.privateBucket;
}

export function publicUrlForKey(key: string): string {
  const base = objectStorageConfig().publicBaseUrl;
  if (!base) {
    throw missingSetting(OBJECT_STORAGE_PUBLIC_BASE_URL_ENV, R2_PUBLIC_BASE_URL_ENV_NAME);
  }
  return `${base.replace(/\/$/, '')}/${key}`;
}

export function objectKeyFromPublicUrl(value: string): string | null {
  const configuredBase = objectStorageConfig().publicBaseUrl;
  if (!configuredBase || value.includes('\\') || /%(?:2e|2f|5c)/i.test(value)) return null;

  try {
    const base = new URL(configuredBase);
    const candidate = new URL(value);
    if (
      candidate.origin !== base.origin ||
      candidate.username ||
      candidate.password ||
      candidate.search ||
      candidate.hash
    ) {
      return null;
    }

    const basePath = base.pathname.replace(/\/+$/, '');
    const prefix = `${basePath}/`;
    if (!candidate.pathname.startsWith(prefix)) return null;

    const key = candidate.pathname.slice(prefix.length);
    if (
      !key ||
      !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(key) ||
      key.includes('//') ||
      key.split('/').some((segment) => segment === '.' || segment === '..')
    ) {
      return null;
    }
    return key;
  } catch {
    return null;
  }
}

export function objectKeyFromStorageUri(value: string): string | null {
  if (
    /^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(value) &&
    !value.includes('//') &&
    !value.split('/').some((segment) => segment === '.' || segment === '..')
  ) {
    return value;
  }
  return objectKeyFromPublicUrl(value);
}

interface PutObjectParams {
  key: string;
  data: Buffer | Uint8Array | Readable;
  contentType: string;
  contentLength?: number;
}

function putObjectInBucket(
  bucket: string,
  params: PutObjectParams,
  store: ObjectStore = getObjectStore(),
): Promise<void> {
  return store.put({
    bucket,
    key: params.key,
    body: params.data,
    contentType: params.contentType,
    contentLength: params.contentLength,
  });
}

export async function putObject(params: PutObjectParams): Promise<{ url: string }> {
  await putObjectInBucket(publicBucketName(), params);
  return { url: publicUrlForKey(params.key) };
}

export async function putPrivateObject(params: PutObjectParams): Promise<{ key: string }> {
  await createPrivateObjectWriter().put(params);
  return { key: params.key };
}

function objectBucketIdentity(config: ObjectStorageConfig, bucket: string): string {
  return createHash('sha256')
    .update(
      JSON.stringify([
        'object-cleanup-v1',
        config.provider,
        config.endpoint,
        config.region,
        config.forcePathStyle,
        bucket,
      ]),
    )
    .digest('hex');
}

export function createPrivateObjectWriter(): {
  target: string;
  put(params: PutObjectParams): Promise<void>;
} {
  const config = objectStorageConfig();
  const bucket = privateBucketName(config);
  const store = getObjectStore();
  return Object.freeze({
    target: objectBucketIdentity(config, bucket),
    put: (params: PutObjectParams) => putObjectInBucket(bucket, params, store),
  });
}

async function getObjectFromBucket(
  bucket: string,
  key: string,
): Promise<{ data: Buffer; contentType: string | undefined } | null> {
  const stored = await getObjectStore().get(bucket, key);
  if (!stored) return null;
  return { data: Buffer.from(stored.data), contentType: stored.contentType };
}

export function getObject(
  key: string,
): Promise<{ data: Buffer; contentType: string | undefined } | null> {
  return getObjectFromBucket(publicBucketName(), key);
}

export function getPrivateObject(
  key: string,
): Promise<{ data: Buffer; contentType: string | undefined } | null> {
  return getObjectFromBucket(privateBucketName(), key);
}

export class StoredObjectTooLargeError extends Error {
  constructor(
    readonly key: string,
    readonly maxBytes: number,
    readonly contentLength?: number,
  ) {
    super(`Stored object exceeds the permitted ${maxBytes} bytes`);
    this.name = 'StoredObjectTooLargeError';
  }
}

export function headPrivateObject(key: string) {
  return getObjectStore().head(privateBucketName(), key);
}

export interface BoundedStoredObject {
  data: Buffer;
  contentType: string | undefined;
  etag: string | undefined;
}

async function getBoundedObjectFromBucket(
  bucket: string,
  key: string,
  maxBytes: number,
): Promise<BoundedStoredObject | null> {
  const store = getObjectStore();
  const head = await store.head(bucket, key);
  if (!head) return null;
  if (head.contentLength === undefined || head.contentLength > maxBytes) {
    throw new StoredObjectTooLargeError(key, maxBytes, head.contentLength);
  }

  const stream = await store.getStream(bucket, key);
  if (!stream) return null;

  const reader = stream.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      received += value.byteLength;
      if (received > maxBytes) {
        throw new StoredObjectTooLargeError(key, maxBytes, undefined);
      }
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  return { data: Buffer.concat(chunks), contentType: stream.contentType, etag: head.etag };
}

export function getBoundedObject(
  key: string,
  maxBytes: number,
): Promise<BoundedStoredObject | null> {
  return getBoundedObjectFromBucket(publicBucketName(), key, maxBytes);
}

export function getBoundedPrivateObject(
  key: string,
  maxBytes: number,
): Promise<BoundedStoredObject | null> {
  return getBoundedObjectFromBucket(privateBucketName(), key, maxBytes);
}

export function copyPrivateObjectIfUnchanged(params: {
  sourceKey: string;
  destinationKey: string;
  etag: string;
}): Promise<boolean> {
  return getObjectStore().copyIfMatch({
    bucket: privateBucketName(),
    sourceKey: params.sourceKey,
    destinationKey: params.destinationKey,
    etag: params.etag,
  });
}

export function getObjectStream(key: string, range?: string) {
  return getObjectStore().getStream(publicBucketName(), key, range);
}

export function getPrivateObjectStream(key: string, range?: string) {
  return getObjectStore().getStream(privateBucketName(), key, range);
}

export function deleteObject(key: string): Promise<void> {
  return getObjectStore().delete(publicBucketName(), key);
}

export function deletePrivateObject(key: string): Promise<void> {
  return getObjectStore().delete(privateBucketName(), key);
}

export interface ObjectCleanupPlan {
  targets: Readonly<Record<string, string>>;
  remove(target: { name: string; location: string; objectKey: string }): Promise<void>;
}

export function createObjectCleanupPlan(): ObjectCleanupPlan {
  const config = objectStorageConfig();
  const buckets = new Map([['private', privateBucketName(config)]]);
  if (config.publicBucket) buckets.set('legacy-public', publicBucketName(config));
  const store = getObjectStore();
  const targets = Object.freeze(
    Object.fromEntries(
      [...buckets].map(([name, bucket]) => [name, objectBucketIdentity(config, bucket)]),
    ),
  );
  return {
    targets,
    async remove({ name, location, objectKey }) {
      const bucket = buckets.get(name);
      if (
        !bucket ||
        targets[name] !== location ||
        objectKeyFromStorageUri(objectKey) !== objectKey
      ) {
        throw new Error('Object cleanup does not match its pinned storage target.');
      }
      await store.delete(bucket, objectKey);
    },
  };
}

interface PresignUploadParams {
  key: string;
  contentType: string;
  contentLength: number;
  expiresInSeconds?: number;
}

interface PresignedDirectUpload {
  uploadUrl: string;
  uploadHeaders: Readonly<Record<string, string>>;
}

async function presignUploadForBucket(
  bucket: string,
  params: PresignUploadParams,
): Promise<PresignedDirectUpload> {
  const { url, headers } = await getObjectStore().presignPut({
    bucket,
    key: params.key,
    contentType: params.contentType,
    contentLength: params.contentLength,
    expiresInSeconds: params.expiresInSeconds ?? DEFAULT_PRESIGNED_UPLOAD_TTL_SECONDS,
  });
  return { uploadUrl: url, uploadHeaders: headers };
}

export async function getPresignedUploadUrl(
  params: PresignUploadParams,
): Promise<PresignedDirectUpload & { publicUrl: string }> {
  const upload = await presignUploadForBucket(publicBucketName(), params);
  return { ...upload, publicUrl: publicUrlForKey(params.key) };
}

export function getPresignedPrivateUploadUrl(
  params: PresignUploadParams,
): Promise<PresignedDirectUpload> {
  return presignUploadForBucket(privateBucketName(), params);
}

export function getPresignedPrivateDownloadUrl(params: {
  key: string;
  fileName: string;
  expiresInSeconds: number;
}): Promise<string> {
  return getObjectStore().presignGet({
    bucket: privateBucketName(),
    key: params.key,
    downloadFileName: params.fileName,
    expiresInSeconds: params.expiresInSeconds,
  });
}
