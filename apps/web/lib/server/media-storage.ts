import 'server-only';

import { createHash, randomUUID } from 'crypto';
import { createReadStream } from 'node:fs';
import { copyFile, mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import path from 'node:path';
import { logger } from '@/lib/logger';
import {
  putObject,
  putPrivateObject,
  getObject,
  getPrivateObject,
  getObjectStream,
  getPrivateObjectStream,
  deleteObject,
  deletePrivateObject,
  isObjectStorageConfigured,
  isPrivateObjectStorageConfigured,
} from './object-storage';

/**
 * Object storage for AI-generated media.
 *
 * Production is backed by Cloudflare R2. Local development gets an
 * owner-scoped filesystem fallback under `.agi-local-media`, allowing
 * generated images/files to survive browser reloads and Next build-cache
 * cleanup without weakening the production storage contract or requiring
 * cloud credentials for a demo.
 */

export interface StoredMedia {
  url: string;
  pathname: string;
  byteSize: number;
  contentType: string;
}

const LOCAL_MEDIA_PREFIX = 'local-dev-media/';
const PRIVATE_VIDEO_PREFIX = 'private-media/video/';

function isLocalDevelopmentMediaStorageEnabled(): boolean {
  return process.env['NODE_ENV'] === 'development';
}

function localMediaRoot(): string {
  // `.next` is a disposable build cache. Keeping user-visible Library bytes
  // there made a normal local rebuild turn durable database rows into 404s.
  return path.resolve(process.cwd(), '.agi-local-media');
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
  return (
    isObjectStorageConfigured() ||
    isPrivateObjectStorageConfigured() ||
    isLocalDevelopmentMediaStorageEnabled()
  );
}

/** Images/files still use the existing public bucket contract in production. */
export function isImageStorageConfigured(): boolean {
  return isObjectStorageConfigured() || isLocalDevelopmentMediaStorageEnabled();
}

/**
 * Video results require the separate non-public R2 bucket in production. The
 * public media bucket is deliberately insufficient: hiding its URL would not
 * make the bytes owner-only.
 */
export function isVideoStorageConfigured(): boolean {
  return isPrivateObjectStorageConfigured() || isLocalDevelopmentMediaStorageEnabled();
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

function ownerStorageHash(userId: string): string {
  return createHash('sha256').update(userId).digest('hex').slice(0, 32);
}

function privateVideoPathname(userId: string, objectId: string, extension: string): string {
  return `${PRIVATE_VIDEO_PREFIX}${ownerStorageHash(userId)}/${objectId}.${extension}`;
}

/**
 * Resolve the exact owner-scoped video object name before upload egress.
 * Callers can therefore compensate a PutObject whose commit response is lost:
 * the object identity never exists only in the SDK's successful return value.
 */
export function videoStoragePathname(input: {
  userId: string;
  storageId: string;
  contentType: string;
}): string {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      input.storageId,
    )
  ) {
    throw new Error('Stable media storage identity must be a UUID.');
  }
  const extension = extForMime(input.contentType);
  if (isPrivateObjectStorageConfigured()) {
    return privateVideoPathname(input.userId, input.storageId, extension);
  }
  if (isLocalDevelopmentMediaStorageEnabled()) {
    return `${LOCAL_MEDIA_PREFIX}video/${ownerStorageHash(input.userId)}/${input.storageId}.${extension}`;
  }
  throw new Error('Private video storage is not configured.');
}

function isPrivateVideoPathname(pathname: string): boolean {
  return /^private-media\/video\/[a-f0-9]{32}\/[0-9a-f-]{36}\.(?:mp4|webm|mov)$/i.test(pathname);
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
  /**
   * Stable UUID for retryable async persistence. When present, retries replace
   * the same object instead of leaking one random object per crashed worker.
   */
  storageId?: string;
}): Promise<StoredMedia> {
  const { userId, kind, data, contentType } = params;
  const extension = extForMime(contentType);
  const objectId = params.storageId ?? randomUUID();
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(objectId)
  ) {
    throw new Error('Stable media storage identity must be a UUID.');
  }

  if (kind === 'video' && isPrivateObjectStorageConfigured()) {
    const pathname = privateVideoPathname(userId, objectId, extension);
    await putPrivateObject({ key: pathname, data, contentType });
    return {
      // Internal locator only: no public bucket URL exists for this object.
      url: pathname,
      pathname,
      byteSize: data.byteLength,
      contentType,
    };
  }

  if (kind !== 'video' && isObjectStorageConfigured()) {
    const pathname = `media/${kind}/${userId}/${objectId}.${extension}`;
    const { url } = await putObject({ key: pathname, data, contentType });
    return { url, pathname, byteSize: data.byteLength, contentType };
  }

  if (!isLocalDevelopmentMediaStorageEnabled()) {
    throw new Error('Media storage is not configured.');
  }

  const ownerHash = ownerStorageHash(userId);
  const pathname = `${LOCAL_MEDIA_PREFIX}${kind}/${ownerHash}/${objectId}.${extension}`;
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

/** Store a bounded temporary file without loading a generated video into RAM. */
export async function storeMediaFile(params: {
  userId: string;
  kind: 'video' | 'file';
  filePath: string;
  byteSize: number;
  contentType: string;
  storageId: string;
}): Promise<StoredMedia> {
  const { userId, kind, filePath, byteSize, contentType, storageId } = params;
  if (!Number.isSafeInteger(byteSize) || byteSize <= 0) {
    throw new Error('Stored media file size is invalid.');
  }
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(storageId)
  ) {
    throw new Error('Stable media storage identity must be a UUID.');
  }
  const fileInfo = await stat(filePath);
  if (!fileInfo.isFile() || fileInfo.size !== byteSize) {
    throw new Error('Stored media file does not match its validated size.');
  }
  const extension = extForMime(contentType);

  if (kind === 'video' && isPrivateObjectStorageConfigured()) {
    const pathname = videoStoragePathname({ userId, storageId, contentType });
    await putPrivateObject({
      key: pathname,
      data: createReadStream(filePath),
      contentType,
      contentLength: byteSize,
    });
    return { url: pathname, pathname, byteSize, contentType };
  }

  if (kind !== 'video' && isObjectStorageConfigured()) {
    const pathname = `media/${kind}/${userId}/${storageId}.${extension}`;
    const { url } = await putObject({
      key: pathname,
      data: createReadStream(filePath),
      contentType,
      contentLength: byteSize,
    });
    return { url, pathname, byteSize, contentType };
  }

  if (!isLocalDevelopmentMediaStorageEnabled()) {
    throw new Error('Media storage is not configured.');
  }
  const ownerHash = ownerStorageHash(userId);
  const pathname = `${LOCAL_MEDIA_PREFIX}${kind}/${ownerHash}/${storageId}.${extension}`;
  const localPath = localPathForStoragePathname(pathname);
  if (!localPath) throw new Error('Could not resolve the local media storage path.');
  await mkdir(path.dirname(localPath), { recursive: true });
  await copyFile(filePath, localPath);
  return { url: pathname, pathname, byteSize, contentType };
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
      return {
        data: await readFile(/* turbopackIgnore: true */ localPath),
        contentType: undefined,
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  if (pathname.startsWith(PRIVATE_VIDEO_PREFIX)) {
    if (!isPrivateVideoPathname(pathname) || !isPrivateObjectStorageConfigured()) return null;
    return getPrivateObject(pathname);
  }

  if (!isObjectStorageConfigured()) return null;
  return getObject(pathname);
}

export async function streamStoredMedia(
  pathname: string,
  range?: { start: number; end: number },
): Promise<{
  body: ReadableStream<Uint8Array>;
  contentType: string | undefined;
  contentLength: number;
  contentRange: string | undefined;
} | null> {
  if (pathname.startsWith(LOCAL_MEDIA_PREFIX)) {
    const localPath = localPathForStoragePathname(pathname);
    if (!localPath) return null;
    try {
      const info = await stat(/* turbopackIgnore: true */ localPath);
      const start = range?.start ?? 0;
      const end = range?.end ?? info.size - 1;
      if (start < 0 || end < start || end >= info.size) return null;
      const nodeStream = createReadStream(/* turbopackIgnore: true */ localPath, { start, end });
      return {
        body: Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>,
        contentType: undefined,
        contentLength: end - start + 1,
        contentRange: range ? `bytes ${start}-${end}/${info.size}` : undefined,
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  if (pathname.startsWith(PRIVATE_VIDEO_PREFIX)) {
    if (!isPrivateVideoPathname(pathname) || !isPrivateObjectStorageConfigured()) return null;
    const object = await getPrivateObjectStream(
      pathname,
      range ? `bytes=${range.start}-${range.end}` : undefined,
    );
    if (!object || object.contentLength == null) return null;
    return {
      body: object.body,
      contentType: object.contentType,
      contentLength: object.contentLength,
      contentRange: object.contentRange,
    };
  }

  if (!isObjectStorageConfigured()) return null;
  const object = await getObjectStream(
    pathname,
    range ? `bytes=${range.start}-${range.end}` : undefined,
  );
  if (!object || object.contentLength == null) return null;
  return {
    body: object.body,
    contentType: object.contentType,
    contentLength: object.contentLength,
    contentRange: object.contentRange,
  };
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

  if (pathname.startsWith(PRIVATE_VIDEO_PREFIX)) {
    if (!isPrivateVideoPathname(pathname)) {
      throw new Error('Invalid private video storage path.');
    }
    await deletePrivateObject(pathname);
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
