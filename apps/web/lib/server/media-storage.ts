import 'server-only';

import { createHash, randomUUID } from 'crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { logger } from '@/lib/logger';
import { putObject, getObject, deleteObject, isObjectStorageConfigured } from './object-storage';

/**
 * Object storage for AI-generated media.
 *
 * Production is backed by Cloudflare R2. Local development gets an
 * owner-scoped filesystem fallback under `.next/agi-local-media`, allowing
 * generated images/files to survive a browser reload without weakening the
 * production storage contract or requiring cloud credentials for a demo.
 */

export interface StoredMedia {
  url: string;
  pathname: string;
  byteSize: number;
  contentType: string;
}

const LOCAL_MEDIA_PREFIX = 'local-dev-media/';

function isLocalDevelopmentMediaStorageEnabled(): boolean {
  return process.env['NODE_ENV'] === 'development';
}

function localMediaRoot(): string {
  return path.resolve(process.cwd(), '.next', 'agi-local-media');
}

/**
 * Turn only our own generated local locator into a filesystem path.
 * The strict shape and containment check prevent traversal even if a database
 * row is tampered with.
 */
function localPathForStoragePathname(pathname: string): string | null {
  if (!isLocalDevelopmentMediaStorageEnabled()) return null;
  if (
    !/^local-dev-media\/(?:image|video|file)\/[a-f0-9]{32}\/[0-9a-f-]{36}\.[a-z0-9]+$/i.test(
      pathname,
    )
  ) {
    return null;
  }

  const root = localMediaRoot();
  const relative = pathname.slice(LOCAL_MEDIA_PREFIX.length);
  const resolved = path.resolve(root, relative);
  return resolved.startsWith(`${root}${path.sep}`) ? resolved : null;
}

/** True when production R2 or the development-only local fallback is available. */
export function isMediaStorageConfigured(): boolean {
  return isObjectStorageConfigured() || isLocalDevelopmentMediaStorageEnabled();
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

/** Store bytes in production R2 or the development-only local fallback. */
export async function storeMedia(params: {
  userId: string;
  kind: 'image' | 'video' | 'file';
  data: Buffer | Uint8Array;
  contentType: string;
}): Promise<StoredMedia> {
  const { userId, kind, data, contentType } = params;
  const extension = extForMime(contentType);

  if (isObjectStorageConfigured()) {
    const pathname = `media/${kind}/${userId}/${randomUUID()}.${extension}`;
    const { url } = await putObject({ key: pathname, data, contentType });
    return { url, pathname, byteSize: data.byteLength, contentType };
  }

  if (!isLocalDevelopmentMediaStorageEnabled()) {
    throw new Error('Media storage is not configured.');
  }

  const ownerHash = createHash('sha256').update(userId).digest('hex').slice(0, 32);
  const pathname = `${LOCAL_MEDIA_PREFIX}${kind}/${ownerHash}/${randomUUID()}.${extension}`;
  const localPath = localPathForStoragePathname(pathname);
  if (!localPath) throw new Error('Could not resolve the local media storage path.');

  await mkdir(path.dirname(localPath), { recursive: true });
  await writeFile(localPath, data);
  return {
    // This is an internal locator only. Clients receive the authenticated
    // `/api/files/{assetId}` URL after the media_assets row is created.
    url: pathname,
    pathname,
    byteSize: data.byteLength,
    contentType,
  };
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

/** Read stored bytes from the matching production or local-development backend. */
export async function readStoredMedia(
  pathname: string,
): Promise<{ data: Buffer; contentType: string | undefined } | null> {
  if (pathname.startsWith(LOCAL_MEDIA_PREFIX)) {
    const localPath = localPathForStoragePathname(pathname);
    if (!localPath) return null;
    try {
      return { data: await readFile(localPath), contentType: undefined };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  if (!isObjectStorageConfigured()) return null;
  return getObject(pathname);
}

/** Remove a previously stored object by pathname. Throws on failure. */
export async function deleteStoredMedia(pathname: string): Promise<void> {
  if (pathname.startsWith(LOCAL_MEDIA_PREFIX)) {
    const localPath = localPathForStoragePathname(pathname);
    if (!localPath) throw new Error('Invalid local media storage path.');
    try {
      await unlink(localPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    return;
  }

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
  if (!isMediaStorageConfigured()) {
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
      await deleteStoredMedia(pathname);
      deleted++;
    } catch (error) {
      failedPathnames.push(pathname);
      logger.warn({ pathname, error }, 'Failed to delete stored media object');
    }
  }
  return { deleted, failedPathnames };
}
