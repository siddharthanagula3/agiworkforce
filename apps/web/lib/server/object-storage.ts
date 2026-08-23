import 'server-only';

import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  CopyObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Readable } from 'node:stream';

function env(name: string): string | undefined {
  return process.env[name]?.trim() || undefined;
}

function hasR2Credentials(): boolean {
  return Boolean(
    env('CLOUDFLARE_R2_ACCOUNT_ID') &&
    env('CLOUDFLARE_R2_ACCESS_KEY_ID') &&
    env('CLOUDFLARE_R2_SECRET_ACCESS_KEY'),
  );
}

export function isObjectStorageConfigured(): boolean {
  return Boolean(
    hasR2Credentials() && env('CLOUDFLARE_R2_BUCKET_NAME') && env('CLOUDFLARE_R2_PUBLIC_BASE_URL'),
  );
}

export function isPrivateObjectStorageConfigured(): boolean {
  const privateBucket = env('CLOUDFLARE_R2_PRIVATE_BUCKET_NAME');
  const publicBucket = env('CLOUDFLARE_R2_BUCKET_NAME');
  return Boolean(
    hasR2Credentials() && privateBucket && (!publicBucket || privateBucket !== publicBucket),
  );
}

let cachedClient: S3Client | null = null;

function getR2Client(): S3Client {
  if (cachedClient) return cachedClient;

  const accountId = env('CLOUDFLARE_R2_ACCOUNT_ID');
  const accessKeyId = env('CLOUDFLARE_R2_ACCESS_KEY_ID');
  const secretAccessKey = env('CLOUDFLARE_R2_SECRET_ACCESS_KEY');

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error(
      'Cloudflare R2 is not configured. Set CLOUDFLARE_R2_ACCOUNT_ID, CLOUDFLARE_R2_ACCESS_KEY_ID, and CLOUDFLARE_R2_SECRET_ACCESS_KEY.',
    );
  }

  cachedClient = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
  return cachedClient;
}

function getPublicBucketName(): string {
  const bucket = env('CLOUDFLARE_R2_BUCKET_NAME');
  if (!bucket) throw new Error('CLOUDFLARE_R2_BUCKET_NAME is not configured.');
  return bucket;
}

function getPrivateBucketName(): string {
  const bucket = env('CLOUDFLARE_R2_PRIVATE_BUCKET_NAME');
  const publicBucket = env('CLOUDFLARE_R2_BUCKET_NAME');
  if (!bucket) throw new Error('CLOUDFLARE_R2_PRIVATE_BUCKET_NAME is not configured.');
  if (publicBucket && bucket === publicBucket) {
    throw new Error('The private R2 bucket must be distinct from the public R2 bucket.');
  }
  return bucket;
}

export function publicUrlForKey(key: string): string {
  const base = env('CLOUDFLARE_R2_PUBLIC_BASE_URL');
  if (!base) throw new Error('CLOUDFLARE_R2_PUBLIC_BASE_URL is not configured.');
  return `${base.replace(/\/$/, '')}/${key}`;
}

export function objectKeyFromPublicUrl(value: string): string | null {
  const configuredBase = env('CLOUDFLARE_R2_PUBLIC_BASE_URL');
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

async function putObjectInBucket(bucket: string, params: PutObjectParams): Promise<void> {
  const client = getR2Client();
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: params.key,
      Body: params.data,
      ContentType: params.contentType,
      ContentLength: params.contentLength,
    }),
  );
}

export async function putObject(params: PutObjectParams): Promise<{ url: string }> {
  await putObjectInBucket(getPublicBucketName(), params);
  return { url: publicUrlForKey(params.key) };
}

export async function putPrivateObject(params: PutObjectParams): Promise<{ key: string }> {
  await putObjectInBucket(getPrivateBucketName(), params);
  return { key: params.key };
}

async function getObjectFromBucket(
  bucket: string,
  key: string,
): Promise<{ data: Buffer; contentType: string | undefined } | null> {
  const client = getR2Client();
  try {
    const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    if (!res.Body) return null;
    const bytes = await res.Body.transformToByteArray();
    return { data: Buffer.from(bytes), contentType: res.ContentType };
  } catch (error) {
    const name = (error as { name?: string } | null)?.name;
    if (name === 'NoSuchKey' || name === 'NotFound') return null;
    throw error;
  }
}

export function getObject(
  key: string,
): Promise<{ data: Buffer; contentType: string | undefined } | null> {
  return getObjectFromBucket(getPublicBucketName(), key);
}

export function getPrivateObject(
  key: string,
): Promise<{ data: Buffer; contentType: string | undefined } | null> {
  return getObjectFromBucket(getPrivateBucketName(), key);
}

export interface StoredObjectStream {
  body: ReadableStream<Uint8Array>;
  contentType: string | undefined;
  contentLength: number | undefined;
  contentRange: string | undefined;
}

async function getObjectStreamFromBucket(
  bucket: string,
  key: string,
  range?: string,
): Promise<StoredObjectStream | null> {
  const client = getR2Client();
  try {
    const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key, Range: range }));
    if (!res.Body) return null;
    return {
      body: res.Body.transformToWebStream(),
      contentType: res.ContentType,
      contentLength: res.ContentLength,
      contentRange: res.ContentRange,
    };
  } catch (error) {
    const name = (error as { name?: string } | null)?.name;
    if (name === 'NoSuchKey' || name === 'NotFound') return null;
    throw error;
  }
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

export interface StoredObjectHead {
  contentLength: number | undefined;
  contentType: string | undefined;
  etag: string | undefined;
}

async function headObjectInBucket(bucket: string, key: string): Promise<StoredObjectHead | null> {
  const client = getR2Client();
  try {
    const res = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return { contentLength: res.ContentLength, contentType: res.ContentType, etag: res.ETag };
  } catch (error) {
    const name = (error as { name?: string } | null)?.name;
    if (name === 'NoSuchKey' || name === 'NotFound') return null;
    throw error;
  }
}

export function headPrivateObject(key: string): Promise<StoredObjectHead | null> {
  return headObjectInBucket(getPrivateBucketName(), key);
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
  const head = await headObjectInBucket(bucket, key);
  if (!head) return null;
  if (head.contentLength === undefined || head.contentLength > maxBytes) {
    throw new StoredObjectTooLargeError(key, maxBytes, head.contentLength);
  }

  const stream = await getObjectStreamFromBucket(bucket, key);
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
  }
  return { data: Buffer.concat(chunks), contentType: stream.contentType, etag: head.etag };
}

export function getBoundedObject(
  key: string,
  maxBytes: number,
): Promise<BoundedStoredObject | null> {
  return getBoundedObjectFromBucket(getPublicBucketName(), key, maxBytes);
}

export function getBoundedPrivateObject(
  key: string,
  maxBytes: number,
): Promise<BoundedStoredObject | null> {
  return getBoundedObjectFromBucket(getPrivateBucketName(), key, maxBytes);
}

// Copies only if the source still carries the ETag the caller inspected, so the bytes that
// were scanned are the bytes that get served; a swap after the scan fails the precondition.
export async function copyPrivateObjectIfUnchanged(params: {
  sourceKey: string;
  destinationKey: string;
  etag: string;
}): Promise<boolean> {
  const bucket = getPrivateBucketName();
  try {
    await getR2Client().send(
      new CopyObjectCommand({
        Bucket: bucket,
        Key: params.destinationKey,
        CopySource: `${bucket}/${params.sourceKey.split('/').map(encodeURIComponent).join('/')}`,
        CopySourceIfMatch: params.etag,
        MetadataDirective: 'COPY',
      }),
    );
    return true;
  } catch (error) {
    const name = (error as { name?: string } | null)?.name;
    const status = (error as { $metadata?: { httpStatusCode?: number } } | null)?.$metadata
      ?.httpStatusCode;
    if (name === 'PreconditionFailed' || status === 412) return false;
    throw error;
  }
}

export function getObjectStream(key: string, range?: string): Promise<StoredObjectStream | null> {
  return getObjectStreamFromBucket(getPublicBucketName(), key, range);
}

export function getPrivateObjectStream(
  key: string,
  range?: string,
): Promise<StoredObjectStream | null> {
  return getObjectStreamFromBucket(getPrivateBucketName(), key, range);
}

export async function deleteObject(key: string): Promise<void> {
  const client = getR2Client();
  await client.send(new DeleteObjectCommand({ Bucket: getPublicBucketName(), Key: key }));
}

export async function deletePrivateObject(key: string): Promise<void> {
  const client = getR2Client();
  await client.send(new DeleteObjectCommand({ Bucket: getPrivateBucketName(), Key: key }));
}

interface PresignUploadParams {
  key: string;
  contentType: string;
  contentLength: number;
  expiresInSeconds?: number;
}

async function presignUploadForBucket(
  bucket: string,
  params: PresignUploadParams,
): Promise<string> {
  if (!Number.isSafeInteger(params.contentLength) || params.contentLength <= 0) {
    throw new Error('A presigned upload must bind a positive content length.');
  }
  const contentType = params.contentType.trim();
  if (!contentType) {
    throw new Error('A presigned upload must bind a content type.');
  }
  const client = getR2Client();
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: params.key,
    ContentType: contentType,
    ContentLength: params.contentLength,
  });
  return getSignedUrl(client, command, {
    expiresIn: params.expiresInSeconds ?? 300,
    signableHeaders: new Set(['content-length', 'content-type']),
  });
}

export async function getPresignedUploadUrl(
  params: PresignUploadParams,
): Promise<{ uploadUrl: string; publicUrl: string }> {
  const uploadUrl = await presignUploadForBucket(getPublicBucketName(), params);
  return { uploadUrl, publicUrl: publicUrlForKey(params.key) };
}

export async function getPresignedPrivateUploadUrl(
  params: PresignUploadParams,
): Promise<{ uploadUrl: string }> {
  return { uploadUrl: await presignUploadForBucket(getPrivateBucketName(), params) };
}
