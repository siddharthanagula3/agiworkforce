import 'server-only';

import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/**
 * Cloudflare R2 object storage (S3-compatible API).
 *
 * R2 has zero egress fees, unlike Vercel Blob's per-GB bandwidth charges, which
 * matters for a chat product serving generated images/attachments repeatedly.
 * Public bucket + permanent URLs, matching the trust model of the prior Vercel
 * Blob usage (all objects were `access: 'public'`).
 *
 * Once the CLOUDFLARE_R2_* env vars below are set, run
 * `node apps/web/scripts/verify-r2-connection.mjs` for an end-to-end smoke
 * test (upload, public-URL fetch, delete) before relying on this in prod.
 */

function env(name: string): string | undefined {
  return process.env[name]?.trim() || undefined;
}

/** True when R2 is configured (account id, keys, bucket, and public base URL present). */
export function isObjectStorageConfigured(): boolean {
  return Boolean(
    env('CLOUDFLARE_R2_ACCOUNT_ID') &&
    env('CLOUDFLARE_R2_ACCESS_KEY_ID') &&
    env('CLOUDFLARE_R2_SECRET_ACCESS_KEY') &&
    env('CLOUDFLARE_R2_BUCKET_NAME') &&
    env('CLOUDFLARE_R2_PUBLIC_BASE_URL'),
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

function getBucketName(): string {
  const bucket = env('CLOUDFLARE_R2_BUCKET_NAME');
  if (!bucket) throw new Error('CLOUDFLARE_R2_BUCKET_NAME is not configured.');
  return bucket;
}

/** Public URL for an object key, served via the configured custom domain / r2.dev base URL. */
export function publicUrlForKey(key: string): string {
  const base = env('CLOUDFLARE_R2_PUBLIC_BASE_URL');
  if (!base) throw new Error('CLOUDFLARE_R2_PUBLIC_BASE_URL is not configured.');
  return `${base.replace(/\/$/, '')}/${key}`;
}

/** Upload bytes directly to R2 from server-side code (no client body-size constraint). */
export async function putObject(params: {
  key: string;
  data: Buffer | Uint8Array;
  contentType: string;
}): Promise<{ url: string }> {
  const client = getR2Client();
  await client.send(
    new PutObjectCommand({
      Bucket: getBucketName(),
      Key: params.key,
      Body: params.data,
      ContentType: params.contentType,
    }),
  );
  return { url: publicUrlForKey(params.key) };
}

/** Delete an object from R2 by key (best-effort cleanup). */
export async function deleteObject(key: string): Promise<void> {
  const client = getR2Client();
  await client.send(new DeleteObjectCommand({ Bucket: getBucketName(), Key: key }));
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
    Bucket: getBucketName(),
    Key: params.key,
    ContentType: params.contentType,
  });
  const uploadUrl = await getSignedUrl(client, command, {
    expiresIn: params.expiresInSeconds ?? 300,
  });
  return { uploadUrl, publicUrl: publicUrlForKey(params.key) };
}
