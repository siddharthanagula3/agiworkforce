import 'server-only';

import { randomUUID } from 'crypto';
import { put, del } from '@vercel/blob';

/**
 * Durable object storage for AI-generated media, backed by Vercel Blob.
 *
 * `BLOB_READ_WRITE_TOKEN` is injected automatically on Vercel deployments; when
 * it's absent (e.g. a local dev branch without the token) callers should treat
 * persistence as best-effort and fall back to returning media inline, so a
 * missing token never breaks generation.
 */

export interface StoredMedia {
  url: string;
  pathname: string;
  byteSize: number;
  contentType: string;
}

/** True when Vercel Blob is configured (token present). */
export function isMediaStorageConfigured(): boolean {
  return Boolean(process.env['BLOB_READ_WRITE_TOKEN']);
}

const EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
};

function extForMime(mime: string): string {
  return EXT_BY_MIME[mime] ?? mime.split('/')[1]?.replace(/[^a-z0-9]/gi, '') ?? 'bin';
}

/** Decode a base64 (optionally a data: URI) payload into raw bytes. */
export function bytesFromBase64(b64: string): Buffer {
  const comma = b64.indexOf(',');
  const raw = b64.startsWith('data:') && comma !== -1 ? b64.slice(comma + 1) : b64;
  return Buffer.from(raw, 'base64');
}

/** Fetch remote media bytes (e.g. a provider URL) so we can re-upload durably. */
export async function bytesFromUrl(url: string): Promise<{ data: Buffer; contentType: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch media for persistence (HTTP ${res.status})`);
  const contentType = res.headers.get('content-type') ?? 'application/octet-stream';
  const data = Buffer.from(await res.arrayBuffer());
  return { data, contentType };
}

/** Upload bytes to durable, user-scoped object storage. */
export async function storeMedia(params: {
  userId: string;
  kind: 'image' | 'video';
  data: Buffer | Uint8Array;
  contentType: string;
}): Promise<StoredMedia> {
  const { userId, kind, data, contentType } = params;
  const pathname = `media/${kind}/${userId}/${randomUUID()}.${extForMime(contentType)}`;
  const blob = await put(pathname, data, {
    access: 'public',
    contentType,
    addRandomSuffix: false,
  });
  return { url: blob.url, pathname, byteSize: data.byteLength, contentType };
}

/** Remove a previously stored blob by pathname (best-effort cleanup). */
export async function deleteStoredMedia(pathname: string): Promise<void> {
  await del(pathname);
}
