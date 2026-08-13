import 'server-only';

import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Readable } from 'node:stream';

/**
 * Cloudflare R2 object storage (S3-compatible API).
 *
 * R2 has zero egress fees, unlike Vercel Blob's per-GB bandwidth charges, which
 * matters for a chat product serving generated images/attachments repeatedly.
 * Legacy generated images/files and current avatars may still use the public
 * bucket during migration. New generated media, chat attachments, and project
 * knowledge use a distinct private bucket and are readable only through
 * authenticated owner-scoped routes; private paths never construct or return
 * a public URL.
 *
 * Once the CLOUDFLARE_R2_* env vars below are set, run
 * `node apps/web/scripts/verify-r2-connection.mjs` for an end-to-end smoke
 * test (upload, public-URL fetch, delete) before relying on this in prod.
 */

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

/** True when R2 is configured (account id, keys, bucket, and public base URL present). */
export function isObjectStorageConfigured(): boolean {
  return Boolean(
    hasR2Credentials() && env('CLOUDFLARE_R2_BUCKET_NAME') && env('CLOUDFLARE_R2_PUBLIC_BASE_URL'),
  );
}

/**
 * True only when a separate R2 bucket is configured for private objects.
 * Reusing the public bucket is rejected even if an operator supplies the same
 * name under both env vars: a hidden URL is not an access-control boundary.
 */
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

/** Public URL for an object key, served via the configured custom domain / r2.dev base URL. */
export function publicUrlForKey(key: string): string {
  const base = env('CLOUDFLARE_R2_PUBLIC_BASE_URL');
  if (!base) throw new Error('CLOUDFLARE_R2_PUBLIC_BASE_URL is not configured.');
  return `${base.replace(/\/$/, '')}/${key}`;
}

/**
 * Resolve one of our public R2 URLs back to its object key. This is the
 * inverse of `publicUrlForKey`, with strict origin/path validation so callers
 * never turn a user-supplied URL into an SSRF request or an arbitrary key.
 */
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

/**
 * Resolve a stored object locator. New private-resource paths may store the
 * validated key directly; legacy rows may still contain the configured public
 * URL.
 */
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

/** Upload bytes directly to the public R2 bucket. */
export async function putObject(params: PutObjectParams): Promise<{ url: string }> {
  await putObjectInBucket(getPublicBucketName(), params);
  return { url: publicUrlForKey(params.key) };
}

/** Upload bytes to the private R2 bucket without creating a public locator. */
export async function putPrivateObject(params: PutObjectParams): Promise<{ key: string }> {
  await putObjectInBucket(getPrivateBucketName(), params);
  return { key: params.key };
}

/**
 * Read an object's bytes back from R2 by key. Used by the authenticated
 * same-origin file-serving route (`/api/files/[id]`) so generated-file bytes
 * can be served from the app's own origin — the PDF/image renderer gates only
 * accept `data:`, `blob:`, and same-origin sources, never the raw R2 public
 * URL. Returns null when the object does not exist.
 */
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

/** Stream an object (optionally one HTTP byte range) without buffering it. */
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

export function getObjectStream(key: string, range?: string): Promise<StoredObjectStream | null> {
  return getObjectStreamFromBucket(getPublicBucketName(), key, range);
}

export function getPrivateObjectStream(
  key: string,
  range?: string,
): Promise<StoredObjectStream | null> {
  return getObjectStreamFromBucket(getPrivateBucketName(), key, range);
}

/** Delete an object from R2 by key (best-effort cleanup). */
export async function deleteObject(key: string): Promise<void> {
  const client = getR2Client();
  await client.send(new DeleteObjectCommand({ Bucket: getPublicBucketName(), Key: key }));
}

/** Delete an object from the private R2 bucket. */
export async function deletePrivateObject(key: string): Promise<void> {
  const client = getR2Client();
  await client.send(new DeleteObjectCommand({ Bucket: getPrivateBucketName(), Key: key }));
}

/**
 * Presigned PUT URL so browser code can upload directly to R2 without going
 * through a Vercel serverless function's ~4.5MB request-body limit and
 * without ever holding R2 credentials client-side.
 */
export async function getPresignedUploadUrl(params: {
  key: string;
  contentType: string;
  expiresInSeconds?: number;
}): Promise<{ uploadUrl: string; publicUrl: string }> {
  const client = getR2Client();
  const command = new PutObjectCommand({
    Bucket: getPublicBucketName(),
    Key: params.key,
    ContentType: params.contentType,
  });
  const uploadUrl = await getSignedUrl(client, command, {
    expiresIn: params.expiresInSeconds ?? 300,
  });
  return { uploadUrl, publicUrl: publicUrlForKey(params.key) };
}

/**
 * Presigned PUT URL for an object that must never have a public locator.
 *
 * The browser still uploads directly to R2, so large attachment bytes do not
 * cross the Vercel request-body boundary. Reads must go through an
 * authenticated, owner-scoped application route.
 */
export async function getPresignedPrivateUploadUrl(params: {
  key: string;
  contentType: string;
  expiresInSeconds?: number;
}): Promise<{ uploadUrl: string }> {
  const client = getR2Client();
  const command = new PutObjectCommand({
    Bucket: getPrivateBucketName(),
    Key: params.key,
    ContentType: params.contentType,
  });
  const uploadUrl = await getSignedUrl(client, command, {
    expiresIn: params.expiresInSeconds ?? 300,
  });
  return { uploadUrl };
}
