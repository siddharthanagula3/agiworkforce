import 'server-only';

import { randomUUID } from 'crypto';
import { logger } from '@/lib/logger';
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

/**
 * PER-26 — the ONE client-facing address for stored media bytes.
 *
 * Generated images used to be handed to the client as `media_assets
 * .storage_url`, i.e. the permanent public R2 URL from `publicUrlForKey`. That
 * gave the same bytes two inconsistent access models: attachments went through
 * the authenticated, owner-scoped, `deleted_at`-aware `/api/files/[id]` route,
 * while generated images embedded a URL that never expires and is never revoked
 * — so "delete" deleted nothing that mattered. Every surface now addresses
 * media through this function.
 */
export function authenticatedMediaUrl(mediaAssetId: string): string {
  return `/api/files/${mediaAssetId}`;
}

/** Remove a previously stored object by pathname. Throws on failure. */
export async function deleteStoredMedia(pathname: string): Promise<void> {
  await deleteObject(pathname);
}

/**
 * PER-24 / PER-25 — best-effort byte deletion for lifecycle jobs.
 *
 * Deleting a conversation, an asset or an account removed rows but never the
 * R2 bytes, and `deleteStoredMedia` had exactly one occurrence in the whole
 * repository: its own definition. Combined with the permanent public URLs of
 * PER-26 that made this an ERASURE gap, not just a storage leak.
 *
 * Bulk callers (crons, account deletion) must not abort a purge because one
 * object is already gone, so this reports rather than throws.
 */
export async function deleteStoredMediaObjects(
  pathnames: ReadonlyArray<string | null | undefined>,
): Promise<{ deleted: number; failedPathnames: string[] }> {
  const present = pathnames.filter((p): p is string => typeof p === 'string' && p.length > 0);
  if (!isObjectStorageConfigured()) {
    // The bytes exist but this deployment cannot reach them. Report every
    // pathname as failed so the caller retains its pointers instead of
    // deleting the only record of an object it can no longer address.
    if (present.length > 0) {
      logger.warn(
        { count: present.length },
        'Object storage is not configured; stored media objects were not deleted',
      );
    }
    return { deleted: 0, failedPathnames: [...present] };
  }
  let deleted = 0;
  const failedPathnames: string[] = [];
  for (const pathname of present) {
    try {
      await deleteObject(pathname);
      deleted++;
    } catch (error) {
      failedPathnames.push(pathname);
      logger.warn({ pathname, error }, 'Failed to delete stored media object');
    }
  }
  return { deleted, failedPathnames };
}
