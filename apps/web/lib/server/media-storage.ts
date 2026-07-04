import 'server-only';

import { randomUUID } from 'crypto';
import { putObject, deleteObject, isObjectStorageConfigured } from './object-storage';

/**
 * Durable object storage for AI-generated media, backed by Cloudflare R2.
 *
 * When R2 is not configured (e.g. a local dev branch without credentials)
 * callers should treat persistence as best-effort and fall back to returning
 * media inline, so missing config never breaks generation.
 */

export interface StoredMedia {
  url: string;
  pathname: string;
  byteSize: number;
  contentType: string;
}

/** True when Cloudflare R2 is configured. */
export function isMediaStorageConfigured(): boolean {
  return isObjectStorageConfigured();
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
  kind: 'image' | 'video' | 'file';
  data: Buffer | Uint8Array;
  contentType: string;
}): Promise<StoredMedia> {
  const { userId, kind, data, contentType } = params;
  const pathname = `media/${kind}/${userId}/${randomUUID()}.${extForMime(contentType)}`;
  const { url } = await putObject({ key: pathname, data, contentType });
  return { url, pathname, byteSize: data.byteLength, contentType };
}

/** Remove a previously stored object by pathname (best-effort cleanup). */
export async function deleteStoredMedia(pathname: string): Promise<void> {
  await deleteObject(pathname);
}
